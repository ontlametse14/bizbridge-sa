-- A stale owner plan is an application conflict, not a PostgreSQL
-- serialization failure. SQLSTATE 40001 can trigger PostgREST retry loops.
-- Preserve the already-applied migration and narrowly replace its error code.
begin;
do $migration$
declare definition text;
begin
  definition := pg_catalog.pg_get_functiondef('public.change_money_plan(uuid,uuid,integer,text,jsonb)'::regprocedure);
  if pg_catalog.strpos(definition, $old$using errcode = '40001'$old$) = 0 then
    raise exception 'Expected Money Split conflict clause was not found';
  end if;
  execute pg_catalog.replace(definition, $old$using errcode = '40001'$old$, $new$using errcode = 'PT409'$new$);
end;
$migration$;
revoke all on function public.change_money_plan(uuid,uuid,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.change_money_plan(uuid,uuid,integer,text,jsonb) to authenticated;
commit;
