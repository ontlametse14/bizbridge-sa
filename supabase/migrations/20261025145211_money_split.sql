-- Money Split is an owner-entered plan, never an accounting/bank ledger.
-- Append-only events/snapshots/withdrawals; all writes through one checked RPC.
begin;
create table public.money_plan_state (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0)
);
create table public.money_plan_events (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  revision integer not null check (revision > 0),
  kind text not null check (kind in ('confirm','allocation','cancel','settle','withdrawal','correct_withdrawal')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  previous_allocation jsonb,
  created_at timestamptz not null default now(),
  unique (business_id, revision), unique (business_id, id)
);
create table public.money_allocations (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null check (category in ('Replacement stock','Upcoming bills','Transport','Emergency buffer','Other')),
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  due_date date check (due_date between date '2000-01-01' and date '2100-12-31'),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'active' check (status in ('active','cancelled','settled')),
  unique (business_id, id)
);
create table public.money_cash_snapshots (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  revision integer not null check (revision > 0),
  cash_cents bigint not null check (cash_cents between 0 and 100000000),
  confirmed_at timestamptz not null default now(),
  source text not null check (source in ('confirm','settle','withdrawal','correct_withdrawal')),
  note text not null default '' check (char_length(note) <= 500),
  unique (business_id, id), unique (business_id, revision),
  foreign key (business_id, id) references public.money_plan_events(business_id, id)
);
create table public.money_withdrawals (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount_cents bigint not null check (amount_cents between 0 and 100000000),
  withdrawal_date date not null check (withdrawal_date >= date '2000-01-01'),
  note text not null default '' check (char_length(note) <= 500),
  corrects_id uuid,
  correction_reason text not null default '' check (char_length(correction_reason) <= 300),
  created_at timestamptz not null default now(),
  unique (business_id, id), unique (business_id, corrects_id),
  check ((corrects_id is null and amount_cents > 0 and correction_reason = '') or (corrects_id is not null and char_length(btrim(correction_reason)) > 0)),
  foreign key (business_id, id) references public.money_cash_snapshots(business_id, id),
  foreign key (business_id, corrects_id) references public.money_withdrawals(business_id, id)
);
-- The composite unique indexes cover the owner-scoped reads and foreign keys.
alter table public.money_plan_state enable row level security;
alter table public.money_plan_events enable row level security;
alter table public.money_allocations enable row level security;
alter table public.money_cash_snapshots enable row level security;
alter table public.money_withdrawals enable row level security;
create policy money_state_read on public.money_plan_state for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy money_events_read on public.money_plan_events for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy money_allocations_read on public.money_allocations for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy money_cash_read on public.money_cash_snapshots for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy money_withdrawals_read on public.money_withdrawals for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
revoke all on public.money_plan_state, public.money_plan_events, public.money_allocations, public.money_cash_snapshots, public.money_withdrawals from public, anon, authenticated;
grant select on public.money_plan_state, public.money_plan_events, public.money_allocations, public.money_cash_snapshots, public.money_withdrawals to authenticated;

create function public.get_money_plan(p_business_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.businesses where id = p_business_id and owner_id = auth.uid()) then
    raise exception 'Business not accessible' using errcode = '42501';
  end if;
  return (select jsonb_build_object(
    'business_id', p_business_id,
    'revision', coalesce((select revision from public.money_plan_state where business_id = p_business_id), 0),
    'allocations', coalesce((select jsonb_agg(a order by a.name, a.id) from public.money_allocations a where a.business_id = p_business_id), '[]'::jsonb),
    'snapshots', coalesce((select jsonb_agg(s order by s.revision desc) from public.money_cash_snapshots s where s.business_id = p_business_id), '[]'::jsonb),
    'withdrawals', coalesce((select jsonb_agg(w order by w.created_at desc, w.id) from public.money_withdrawals w where w.business_id = p_business_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(e order by e.revision desc) from public.money_plan_events e where e.business_id = p_business_id), '[]'::jsonb)
  ));
end; $$;

create function public.change_money_plan(p_business_id uuid, p_request_id uuid, p_expected_revision integer, p_kind text, p_payload jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  current_revision integer; next_revision integer; prior public.money_plan_events;
  allocation public.money_allocations; allocation_id uuid; corrected uuid;
  cash bigint; amount bigint; due date; withdrawn_on date; note text; reason text;
  allowed text[];
begin
  -- Explicit authentication and ownership inside the privileged boundary.
  -- All changes for this business take the existing lock, including first use.
  perform private.lock_owned_business(p_business_id);
  if p_request_id is null or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647
     or p_kind is null or p_kind not in ('confirm','allocation','cancel','settle','withdrawal','correct_withdrawal')
     or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid money-plan request' using errcode = '22023';
  end if;
  select * into prior from public.money_plan_events where business_id = p_business_id and id = p_request_id;
  if found then
    if prior.kind <> p_kind or prior.payload <> p_payload or prior.revision <> p_expected_revision + 1 then
      raise exception 'Retry key belongs to a different money-plan change' using errcode = '22023';
    end if;
    return prior.revision;
  end if;
  select revision into current_revision from public.money_plan_state where business_id = p_business_id;
  current_revision := coalesce(current_revision, 0);
  if current_revision <> p_expected_revision then
    raise exception 'Your money plan changed in another tab. Reload and review the latest balance.' using errcode = '40001';
  end if;
  next_revision := current_revision + 1;
  allowed := case p_kind
    when 'confirm' then array['cash_cents','note']
    when 'allocation' then array['allocation_id','name','category','amount_cents','due_date','note']
    when 'cancel' then array['allocation_id','note']
    when 'settle' then array['allocation_id','cash_cents','note','confirmed']
    else array['amount_cents','withdrawal_date','note','cash_cents','confirmed','corrects_id','correction_reason'] end;
  if exists (select 1 from jsonb_object_keys(p_payload) k where not (k = any(allowed))) then
    raise exception 'Unexpected money-plan field' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload->'note') is distinct from 'string' then raise exception 'Note must be text' using errcode = '22023'; end if;
  note := p_payload->>'note';
  if char_length(note) > 500 then raise exception 'Note is too long' using errcode = '22023'; end if;
  if p_kind in ('confirm','settle','withdrawal','correct_withdrawal') then
    if jsonb_typeof(p_payload->'cash_cents') is distinct from 'number' or (p_payload->>'cash_cents') !~ '^[0-9]+$' then raise exception 'Invalid cash amount' using errcode = '22023'; end if;
    cash := (p_payload->>'cash_cents')::bigint;
    if cash not between 0 and 100000000 then raise exception 'Cash must be between R0 and R1,000,000' using errcode = '22023'; end if;
    if p_kind <> 'confirm' and (p_payload->'confirmed') is distinct from 'true'::jsonb then
      raise exception 'Confirm that the balance already reflects the completed payment or withdrawal' using errcode = '22023';
    end if;
  end if;
  if p_kind in ('allocation','withdrawal','correct_withdrawal') then
    if jsonb_typeof(p_payload->'amount_cents') is distinct from 'number' or (p_payload->>'amount_cents') !~ '^[0-9]+$' then raise exception 'Invalid amount' using errcode = '22023'; end if;
    amount := (p_payload->>'amount_cents')::bigint;
    if amount not between (case when p_kind = 'correct_withdrawal' then 0 else 1 end) and 100000000 then raise exception 'Amount is outside the allowed range' using errcode = '22023'; end if;
  end if;
  if p_kind in ('allocation','cancel','settle') then
    allocation_id := (p_payload->>'allocation_id')::uuid;
    if allocation_id is null and p_kind <> 'allocation' then raise exception 'Allocation required' using errcode = '22023'; end if;
    if allocation_id is not null then
      select * into allocation from public.money_allocations where id = allocation_id and business_id = p_business_id and status = 'active' for update;
      if not found then raise exception 'Active allocation not accessible' using errcode = '42501'; end if;
    end if;
  end if;
  if p_kind = 'allocation' then
    if jsonb_typeof(p_payload->'name') is distinct from 'string' or jsonb_typeof(p_payload->'category') is distinct from 'string' then raise exception 'Allocation name and category required' using errcode = '22023'; end if;
    if (p_payload->>'due_date') is not null then
      if (p_payload->>'due_date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid due date' using errcode = '22023'; end if;
      due := (p_payload->>'due_date')::date;
    end if;
  end if;
  if p_kind in ('withdrawal','correct_withdrawal') then
    if coalesce(p_payload->>'withdrawal_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Withdrawal date required' using errcode = '22023'; end if;
    withdrawn_on := (p_payload->>'withdrawal_date')::date;
    if withdrawn_on < date '2000-01-01' or withdrawn_on > (now() at time zone 'Africa/Johannesburg')::date then raise exception 'Invalid withdrawal date' using errcode = '22023'; end if;
    corrected := (p_payload->>'corrects_id')::uuid;
    reason := coalesce(p_payload->>'correction_reason','');
    if p_kind = 'correct_withdrawal' then
      if corrected is null or char_length(btrim(reason)) not between 1 and 300 then raise exception 'Original withdrawal and correction reason required' using errcode = '22023'; end if;
      if not exists (select 1 from public.money_withdrawals where id = corrected and business_id = p_business_id)
         or exists (select 1 from public.money_withdrawals where corrects_id = corrected and business_id = p_business_id) then
        raise exception 'Withdrawal not accessible or already corrected' using errcode = '42501';
      end if;
    elsif corrected is not null or reason <> '' then raise exception 'Use the correction action' using errcode = '22023';
    end if;
  end if;
  insert into public.money_plan_events(id,business_id,revision,kind,payload,previous_allocation)
    values(p_request_id,p_business_id,next_revision,p_kind,p_payload,case when allocation.id is null then null else to_jsonb(allocation) end);
  if p_kind = 'allocation' then
    if allocation_id is null then
      insert into public.money_allocations(id,business_id,name,category,amount_cents,due_date,note)
        values(p_request_id,p_business_id,btrim(p_payload->>'name'),p_payload->>'category',amount,due,note);
    else
      update public.money_allocations set name=btrim(p_payload->>'name'),category=p_payload->>'category',amount_cents=amount,due_date=due,note=p_payload->>'note' where id=allocation_id and business_id=p_business_id;
    end if;
  elsif p_kind in ('cancel','settle') then
    update public.money_allocations set status=case when p_kind='cancel' then 'cancelled' else 'settled' end where id=allocation_id and business_id=p_business_id;
  end if;
  if p_kind in ('confirm','settle','withdrawal','correct_withdrawal') then
    insert into public.money_cash_snapshots(id,business_id,revision,cash_cents,source,note) values(p_request_id,p_business_id,next_revision,cash,p_kind,note);
  end if;
  if p_kind in ('withdrawal','correct_withdrawal') then
    insert into public.money_withdrawals(id,business_id,amount_cents,withdrawal_date,note,corrects_id,correction_reason)
      values(p_request_id,p_business_id,amount,withdrawn_on,note,corrected,reason);
  end if;
  insert into public.money_plan_state(business_id,revision) values(p_business_id,next_revision)
    on conflict (business_id) do update set revision=excluded.revision;
  return next_revision;
end; $$;
revoke all on function public.get_money_plan(uuid), public.change_money_plan(uuid,uuid,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.get_money_plan(uuid), public.change_money_plan(uuid,uuid,integer,text,jsonb) to authenticated;
commit;
