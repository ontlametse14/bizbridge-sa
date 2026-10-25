-- BizBridge SA v1. Apply once to a fresh Supabase project via SQL Editor or CLI.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  town text not null default '' check (char_length(town) <= 100),
  province text not null default '' check (province in ('','Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape')),
  stage text not null check (stage in ('Planning','Just started','Trading regularly','Growing')),
  records_reviewed boolean not null default false,
  receipts_kept boolean not null default false,
  documents_reviewed boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  sku text check (char_length(sku) <= 60),
  price_cents bigint not null check (price_cents between 1 and 100000000),
  cost_cents bigint check (cost_cents between 0 and 100000000),
  stock integer not null check (stock between 0 and 1000000),
  low_stock_threshold integer check (low_stock_threshold between 0 and 1000000),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 1000000),
  unit_price_cents bigint not null check (unit_price_cents between 1 and 100000000),
  unit_cost_cents bigint check (unit_cost_cents between 0 and 100000000),
  total_cents bigint generated always as (quantity::bigint * unit_price_cents) stored,
  sale_date date not null check (sale_date >= date '2000-01-01'),
  payment_method text not null check (payment_method in ('Cash','EFT','Card','Mobile payment','Other')),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (business_id, idempotency_key),
  foreign key (business_id, product_id) references public.products(business_id, id)
);
create table public.expenses (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  expense_date date not null check (expense_date >= date '2000-01-01'),
  category text not null check (category in ('Transport','Marketing','Utilities','Rent','Packaging','Other')),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null,
  delta integer not null check (delta between -1000000 and 1000000),
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  sale_id uuid references public.sales(id),
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  unique (business_id, idempotency_key),
  foreign key (business_id, product_id) references public.products(business_id, id)
);
create index products_business_idx on public.products(business_id);
create index sales_business_date_idx on public.sales(business_id, sale_date);
create index expenses_business_date_idx on public.expenses(business_id, expense_date);
create index stock_movements_business_idx on public.stock_movements(business_id);

alter table public.businesses enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_movements enable row level security;
create policy business_read on public.businesses for select to authenticated using (owner_id = (select auth.uid()));
create policy business_create on public.businesses for insert to authenticated with check (owner_id = (select auth.uid()));
create policy business_update on public.businesses for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy product_read on public.products for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy sale_read on public.sales for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy expense_read on public.expenses for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy movement_read on public.stock_movements for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
revoke all on public.businesses, public.products, public.sales, public.expenses, public.stock_movements from public, anon, authenticated;
grant select on public.businesses, public.products, public.sales, public.expenses, public.stock_movements to authenticated;
grant insert (owner_id, name, category, town, province, stage, records_reviewed, receipts_kept, documents_reviewed) on public.businesses to authenticated;
grant update (name, category, town, province, stage, records_reviewed, receipts_kept, documents_reviewed) on public.businesses to authenticated;

-- All mutations take this lock first. Serialises writes for one business, with
-- ownership checked inside the privileged boundary, before any product lookup.
create function private.lock_owned_business(p_business_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform 1 from public.businesses where id = p_business_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Business not accessible' using errcode = '42501'; end if;
end; $$;
revoke all on function private.lock_owned_business(uuid) from public, anon, authenticated;

create function public.save_product(p_business_id uuid, p_product_id uuid, p_name text, p_sku text, p_price_cents bigint, p_cost_cents bigint, p_opening_stock integer, p_threshold integer)
returns public.products language plpgsql security definer set search_path = '' as $$
declare result public.products;
begin
  perform private.lock_owned_business(p_business_id);
  if p_opening_stock is null or p_opening_stock not between 0 and 1000000 then raise exception 'Invalid opening stock'; end if;
  if p_product_id is null then
    insert into public.products(business_id, name, sku, price_cents, cost_cents, stock, low_stock_threshold)
      values (p_business_id, btrim(p_name), nullif(btrim(p_sku), ''), p_price_cents, p_cost_cents, p_opening_stock, p_threshold) returning * into result;
    insert into public.stock_movements(business_id, product_id, delta, reason) values (p_business_id, result.id, p_opening_stock, 'Opening stock');
  else
    if p_opening_stock <> 0 then raise exception 'Use a stock adjustment to change stock'; end if;
    update public.products set name = btrim(p_name), sku = nullif(btrim(p_sku), ''), price_cents = p_price_cents, cost_cents = p_cost_cents, low_stock_threshold = p_threshold
      where id = p_product_id and business_id = p_business_id returning * into result;
    if not found then raise exception 'Product not accessible' using errcode = '42501'; end if;
  end if;
  return result;
end; $$;

create function public.archive_product(p_business_id uuid, p_product_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_owned_business(p_business_id);
  update public.products set archived = p_archived where id = p_product_id and business_id = p_business_id;
  if not found then raise exception 'Product not accessible' using errcode = '42501'; end if;
end; $$;

create function public.record_sale(p_business_id uuid, p_product_id uuid, p_quantity integer, p_sale_date date, p_payment_method text, p_idempotency_key uuid)
returns public.sales language plpgsql security definer set search_path = '' as $$
declare product public.products; result public.sales;
begin
  perform private.lock_owned_business(p_business_id);
  if p_idempotency_key is null or p_quantity is null or p_quantity not between 1 and 1000000 or p_sale_date is null or p_sale_date < date '2000-01-01' or p_sale_date > (now() at time zone 'Africa/Johannesburg')::date or p_payment_method is null or p_payment_method not in ('Cash','EFT','Card','Mobile payment','Other') then raise exception 'Invalid sale input'; end if;
  select * into result from public.sales where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if found then
    if result.product_id is distinct from p_product_id or result.quantity is distinct from p_quantity or result.sale_date is distinct from p_sale_date or result.payment_method is distinct from p_payment_method then raise exception 'Retry key belongs to a different sale'; end if;
    return result;
  end if;
  select * into product from public.products where id = p_product_id and business_id = p_business_id and not archived for update;
  if not found then raise exception 'Active product not accessible' using errcode = '42501'; end if;
  if product.stock < p_quantity then raise exception 'Insufficient stock. No sale was saved.'; end if;
  insert into public.sales(business_id, product_id, product_name, quantity, unit_price_cents, unit_cost_cents, sale_date, payment_method, idempotency_key)
    values (p_business_id, product.id, product.name, p_quantity, product.price_cents, product.cost_cents, p_sale_date, p_payment_method, p_idempotency_key) returning * into result;
  update public.products set stock = stock - p_quantity where id = product.id;
  insert into public.stock_movements(business_id, product_id, delta, reason, sale_id) values (p_business_id, product.id, -p_quantity, 'Completed sale', result.id);
  return result;
end; $$;

create function public.adjust_stock(p_business_id uuid, p_product_id uuid, p_delta integer, p_reason text, p_idempotency_key uuid)
returns public.stock_movements language plpgsql security definer set search_path = '' as $$
declare product public.products; result public.stock_movements;
begin
  perform private.lock_owned_business(p_business_id);
  if p_idempotency_key is null or p_delta is null or p_delta = 0 or p_delta not between -1000000 and 1000000 or p_reason is null or char_length(btrim(p_reason)) not between 1 and 300 then raise exception 'Invalid adjustment or missing reason'; end if;
  select * into result from public.stock_movements where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if found then
    if result.product_id is distinct from p_product_id or result.delta is distinct from p_delta or result.reason is distinct from btrim(p_reason) then raise exception 'Retry key belongs to a different adjustment'; end if;
    return result;
  end if;
  select * into product from public.products where id = p_product_id and business_id = p_business_id and not archived for update;
  if not found then raise exception 'Active product not accessible' using errcode = '42501'; end if;
  if product.stock + p_delta not between 0 and 1000000 then raise exception 'Adjustment would put stock outside the allowed range'; end if;
  update public.products set stock = stock + p_delta where id = product.id;
  insert into public.stock_movements(business_id, product_id, delta, reason, idempotency_key)
    values(p_business_id, product.id, p_delta, btrim(p_reason), p_idempotency_key) returning * into result;
  return result;
end; $$;

create function public.record_expense(p_business_id uuid, p_id uuid, p_amount_cents bigint, p_expense_date date, p_category text, p_note text)
returns public.expenses language plpgsql security definer set search_path = '' as $$
declare result public.expenses;
begin
  perform private.lock_owned_business(p_business_id);
  if p_id is null or p_expense_date is null or p_expense_date < date '2000-01-01' or p_expense_date > (now() at time zone 'Africa/Johannesburg')::date then raise exception 'Invalid expense date or key'; end if;
  select * into result from public.expenses where id = p_id;
  if found then
    if result.business_id is distinct from p_business_id or result.amount_cents is distinct from p_amount_cents or result.expense_date is distinct from p_expense_date or result.category is distinct from p_category or result.note is distinct from p_note then raise exception 'Retry key belongs to a different expense'; end if;
    return result;
  end if;
  insert into public.expenses(id, business_id, amount_cents, expense_date, category, note)
    values(p_id, p_business_id, p_amount_cents, p_expense_date, p_category, p_note) returning * into result;
  return result;
end; $$;

-- One statement gives a consistent snapshot and avoids PostgREST's default row
-- cap silently truncating reporting totals. RLS applies to this invoker function.
create function public.get_workspace() returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'business', (select to_jsonb(b) from public.businesses b where b.owner_id = auth.uid()),
    'products', coalesce((select jsonb_agg(p order by p.created_at) from public.products p), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(s order by s.sale_date desc, s.created_at desc) from public.sales s), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(e order by e.expense_date desc, e.created_at desc) from public.expenses e), '[]'::jsonb),
    'movements', coalesce((select jsonb_agg(m order by m.created_at desc) from public.stock_movements m), '[]'::jsonb)
  );
$$;
revoke all on function public.save_product(uuid,uuid,text,text,bigint,bigint,integer,integer), public.archive_product(uuid,uuid,boolean), public.record_sale(uuid,uuid,integer,date,text,uuid), public.adjust_stock(uuid,uuid,integer,text,uuid), public.record_expense(uuid,uuid,bigint,date,text,text), public.get_workspace() from public, anon, authenticated;
grant execute on function public.save_product(uuid,uuid,text,text,bigint,bigint,integer,integer), public.archive_product(uuid,uuid,boolean), public.record_sale(uuid,uuid,integer,date,text,uuid), public.adjust_stock(uuid,uuid,integer,text,uuid), public.record_expense(uuid,uuid,bigint,date,text,text), public.get_workspace() to authenticated;
commit;
