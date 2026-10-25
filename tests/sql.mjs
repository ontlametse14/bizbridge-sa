// Embedded PostgreSQL checks. This is NOT Supabase Auth/PostgREST or a
// multi-connection PostgreSQL concurrency test; see tests/database.mjs.
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite()
let passed=0
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222'
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const uuid=()=>crypto.randomUUID()
async function check(name,fn){await fn();passed++;console.log(`PASS ${name}`)}
async function as(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec(`set role ${user?'authenticated':'anon'}`)}
const one=async(sql,params=[]) => (await db.query(sql,params)).rows[0]
const rejected=async(sql,params=[])=>assert.rejects(()=>db.query(sql,params))
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$; grant usage on schema auth, public to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`)
await db.query('insert into auth.users(id) values ($1),($2)',[a,b])
const migrationsDirectory = new URL('../supabase/migrations/', import.meta.url)
for (const filename of (await readdir(migrationsDirectory)).filter(name => name.endsWith('.sql')).sort()) {
  await db.exec(await readFile(new URL(filename, migrationsDirectory), 'utf8'))
}
console.log('PASS all migrations apply to embedded PostgreSQL');passed++
await as(a)
const ba=(await one("insert into public.businesses(owner_id,name,category,stage) values ($1,'Isolated A','Products','Just started') returning id",[a])).id
const pa=await one("select * from public.save_product($1,null,'Cleaner',null,12000,7000,20,5)",[ba])
await as(b)
const bb=(await one("insert into public.businesses(owner_id,name,category,stage) values ($1,'Isolated B','Products','Just started') returning id",[b])).id
const pb=await one("select * from public.save_product($1,null,'Private product',null,9000,4000,8,2)",[bb])
await as(a)
const key=uuid()
// Use FROM function instead of expanding volatile composite functions: a
// SELECT (function()).* may evaluate a volatile function once per column.
const sell=(id,qty,k=uuid(),business=ba)=>one('select * from public.record_sale($1,$2,$3,$4,$5,$6)',[business,id,qty,today,'Cash',k])
await check('acceptance sale snapshots and stock 18',async()=>{ const s=await sell(pa.id,2,key);assert.equal(Number(s.total_cents),24000);assert.equal(Number(s.unit_cost_cents),7000);assert.equal((await one('select stock from public.products where id=$1',[pa.id])).stock,18) })
await check('acceptance expense and operating profit R70',async()=>{await one('select * from public.record_expense($1,$2,3000,$3,\'Transport\',\'Test\')',[ba,uuid(),today]);const r=await one('select (select sum(total_cents - quantity*unit_cost_cents) from public.sales) - (select sum(amount_cents) from public.expenses) as profit');assert.equal(Number(r.profit),7000)})
await check('same sale retry returns existing transaction',async()=>{const s=await sell(pa.id,2,key);assert.equal(s.idempotency_key,key);assert.equal(Number((await one('select count(*) as n from public.sales')).n),1);assert.equal((await one('select stock from public.products where id=$1',[pa.id])).stock,18)})
await check('changed retry payload is rejected',async()=>{await assert.rejects(()=>sell(pa.id,3,key))})
await check('insufficient stock rolls back sale and movement',async()=>{const before=await one('select count(*) as n from public.stock_movements');await assert.rejects(()=>sell(pa.id,100));assert.equal((await one('select stock from public.products where id=$1',[pa.id])).stock,18);assert.equal((await one('select count(*) as n from public.stock_movements')).n,before.n);assert.equal(Number((await one('select count(*) as n from public.sales')).n),1)})
await check('price changes preserve sale history',async()=>{await one("select * from public.save_product($1,$2,'Changed',null,99900,100,0,5)",[ba,pa.id]);const s=await one('select * from public.sales');assert.equal(Number(s.total_cents),24000);assert.equal(Number(s.unit_cost_cents),7000)})
await check('missing cost remains NULL in sale snapshot',async()=>{const p=await one("select * from public.save_product($1,null,'Unknown cost',null,5000,null,3,null)",[ba]);const s=await sell(p.id,1);assert.equal(s.unit_cost_cents,null)})
await check('A cannot read B records using changed identifiers',async()=>{for(const [table,id] of [['businesses',bb],['products',pb.id]]) assert.equal((await db.query(`select * from public.${table} where id=$1`,[id])).rows.length,0)})
await check('A cannot change B profile',async()=>{assert.equal((await db.query("update public.businesses set name='Attack' where id=$1 returning id",[bb])).rows.length,0)})
await check('A cannot attach B product to an A sale',async()=>{await assert.rejects(()=>sell(pb.id,1))})
await check('A cannot sell using B business identifier',async()=>{await assert.rejects(()=>sell(pb.id,1,uuid(),bb))})
await check('A cannot edit, archive or adjust B products',async()=>{await rejected("select * from public.save_product($1,$2,'Attack',null,1,1,0,1)",[ba,pb.id]);await rejected('select public.archive_product($1,$2,true)',[ba,pb.id]);await rejected("select * from public.adjust_stock($1,$2,2,'Attack',$3)",[ba,pb.id,uuid()]);await rejected("select * from public.adjust_stock($1,$2,2,'Attack',$3)",[bb,pb.id,uuid()])})
await check('A cannot create expenses in B business',async()=>{await rejected("select * from public.record_expense($1,$2,30,$3,'Other','Attack')",[bb,uuid(),today])})
await check('direct writes cannot bypass sale/stock invariants',async()=>{await rejected('update public.products set stock=999 where id=$1',[pa.id]);await rejected('delete from public.sales');await rejected('insert into public.sales default values');await rejected('insert into public.stock_movements default values');await rejected('insert into public.products default values');await rejected('insert into public.expenses default values')})
await check('owner reassignment is denied',async()=>{await rejected('update public.businesses set owner_id=$1 where id=$2',[b,ba])})
await check('one business per owner is enforced',async()=>{await rejected("insert into public.businesses(owner_id,name,category,stage) values ($1,'Duplicate','Products','Planning')",[a])})
await check('database rejects invalid sale values and future dates',async()=>{await assert.rejects(()=>sell(pa.id,0));await rejected("select * from public.record_sale($1,$2,1,'2100-01-01','Cash',$3)",[ba,pa.id,uuid()]);await rejected("select * from public.record_sale($1,$2,1,$3,'Invalid',$4)",[ba,pa.id,today,uuid()])})
await check('adjustment needs a reason, is idempotent and cannot make stock negative',async()=>{await rejected("select * from public.adjust_stock($1,$2,2,'',$3)",[ba,pa.id,uuid()]);await rejected("select * from public.adjust_stock($1,$2,-999,'Damage',$3)",[ba,pa.id,uuid()]);const k=uuid();const x=await one("select * from public.adjust_stock($1,$2,2,'Restock',$3)",[ba,pa.id,k]);const y=await one("select * from public.adjust_stock($1,$2,2,'Restock',$3)",[ba,pa.id,k]);assert.equal(x.id,y.id);assert.equal((await one('select stock from public.products where id=$1',[pa.id])).stock,20)})
await check('workspace aggregation remains scoped by RLS',async()=>{const r=await one('select public.get_workspace() as w');assert.equal(r.w.business.id,ba);assert.ok(r.w.products.every(p=>p.business_id===ba));assert.ok(r.w.sales.every(s=>s.business_id===ba))})
await check('invalid product amounts and quantities are rejected by database constraints',async()=>{await rejected("select * from public.save_product($1,null,'Bad',null,0,7000,20,5)",[ba]);await rejected("select * from public.save_product($1,null,'Bad',null,12000,-1,20,5)",[ba]);await rejected("select * from public.save_product($1,null,'Bad',null,12000,7000,-1,5)",[ba]);await rejected("select * from public.save_product($1,null,'Bad',null,12000,7000,20,-1)",[ba])})
await check('invalid operating expenses are rejected by constraints',async()=>{await rejected("select * from public.record_expense($1,$2,-1,$3,'Transport','')",[ba,uuid(),today]);await rejected("select * from public.record_expense($1,$2,100,$3,'Inventory','')",[ba,uuid(),today])})
await check('expense retry is idempotent and changed payload fails',async()=>{const k=uuid(),params=[ba,k,today];const x=await one("select * from public.record_expense($1,$2,100,$3,'Other','Retry')",params);const y=await one("select * from public.record_expense($1,$2,100,$3,'Other','Retry')",params);assert.equal(x.id,y.id);await rejected("select * from public.record_expense($1,$2,200,$3,'Other','Retry')",params)})
await check('archiving preserves history and blocks new sales',async()=>{await one('select public.archive_product($1,$2,true)',[ba,pa.id]);await assert.rejects(()=>sell(pa.id,1));assert.ok((await db.query('select * from public.sales where product_id=$1',[pa.id])).rows.length>0);await one('select public.archive_product($1,$2,false)',[ba,pa.id])})
await check('private ownership helper cannot be called directly',async()=>{await rejected('select private.lock_owned_business($1)',[ba])})
await as(b)
await check('B cannot read A sales, expenses or movements',async()=>{for(const t of ['sales','expenses','stock_movements'])assert.equal((await db.query(`select * from public.${t} where business_id=$1`,[ba])).rows.length,0)})
await as(null)
await check('anonymous reads and direct function calls are denied',async()=>{for(const t of ['businesses','products','sales','expenses','stock_movements'])await rejected(`select * from public.${t}`);await rejected('select public.get_workspace()');await assert.rejects(()=>sell(pa.id,1));await rejected("select * from public.record_expense($1,$2,30,$3,'Other','')",[ba,uuid(),today])})
await db.exec('reset role; set role authenticated')
await check('privileged mutation explicitly rejects a missing authenticated identity',async()=>{await assert.rejects(()=>sell(pa.id,1));await rejected('select public.archive_product($1,$2,true)',[ba,pa.id])})
await db.close()
console.log(`\n${passed} embedded PostgreSQL checks passed. Multi-connection locking and real Supabase API checks are NOT covered by this runner.`)
