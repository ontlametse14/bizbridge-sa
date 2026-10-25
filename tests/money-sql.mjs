// Isolated PostgreSQL engine, mocked Auth roles. Hosted API/concurrency is separate.
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite(), uuid = () => crypto.randomUUID()
let passed = 0
const check = async (name, fn) => { try { await fn() } catch (e) { console.error(`FAIL ${name}: ${e.code ?? ''} ${e.message}`); await db.close(); process.exit(1) }; console.log(`PASS ${name}`); passed++ }
const one = async (q, p = []) => (await db.query(q, p)).rows[0]
const a = uuid(), b = uuid(), today = new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date())
await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth, public to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;")
await db.query('insert into auth.users values ($1),($2)', [a,b])
const dir = new URL('../supabase/migrations/', import.meta.url)
for (const file of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file,dir), 'utf8'))
const as = async user => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']); await db.exec(`set role ${user ? 'authenticated' : 'anon'}`) }
await as(a); const ba = (await one("insert into public.businesses(owner_id,name,category,stage) values ($1,'Fictional Money A','Products','Planning') returning id",[a])).id
await as(b); const bb = (await one("insert into public.businesses(owner_id,name,category,stage) values ($1,'Fictional Money B','Products','Planning') returning id",[b])).id
const read = async business => (await one('select public.get_money_plan($1) as p',[business])).p
const write = async (business, revision, kind, payload, key=uuid()) => (await one('select public.change_money_plan($1,$2,$3,$4,$5::jsonb) as revision',[business,key,revision,kind,JSON.stringify(payload)])).revision
const cash = amount => ({cash_cents:amount,note:''})
const allocation = (name,amount,category='Other') => ({allocation_id:null,name,category,amount_cents:amount,due_date:null,note:''})
const withdrawal = { amount_cents:15000,withdrawal_date:today,cash_cents:105000,note:'Fictional',confirmed:true,corrects_id:null,correction_reason:'' }
const totals = p => { const allocated=p.allocations.filter(a=>a.status==='active').reduce((n,a)=>n+a.amount_cents,0);return [p.snapshots[0]?.cash_cents ?? null,allocated,p.snapshots[0] ? p.snapshots[0].cash_cents-allocated : null] }
async function seed(business) { let r=await write(business,0,'confirm',cash(120000));for(const [n,v,c] of [['Stock',70000,'Replacement stock'],['Bills',20000,'Upcoming bills'],['Buffer',10000,'Emergency buffer']])r=await write(business,r,'allocation',allocation(n,v,c));return read(business) }
let pb=await seed(bb); await as(a); let pa=await seed(ba)
const originalWorkspace=(await one('select public.get_workspace() w')).w
await check('A: R1200 cash, R1000 allocations, R200 unallocated',()=>assert.deepEqual(totals(pa),[120000,100000,20000]))
await check('B: a withdrawal preview requires no database operation',async()=>{const before=await read(ba);assert.equal(totals(before)[2]-40000,-20000);assert.deepEqual(await read(ba),before)})
const withdrawalKey=uuid()
await check('C: withdrawal and replacement cash save together without double deduction',async()=>{await write(ba,pa.revision,'withdrawal',withdrawal,withdrawalKey);pa=await read(ba);assert.deepEqual(totals(pa),[105000,100000,5000]);assert.equal(pa.withdrawals.length,1);assert.equal(pa.snapshots.length,2)})
await check('retry key returns the same committed operation',async()=>{assert.equal(await write(ba,4,'withdrawal',withdrawal,withdrawalKey),5);assert.equal((await read(ba)).withdrawals.length,1)})
await check('changed retry payload is rejected',()=>assert.rejects(()=>write(ba,4,'withdrawal',{...withdrawal,amount_cents:1},withdrawalKey)))
await check('stale revision rejects a conflicting update without partial saves',async()=>{const before=await read(ba);await assert.rejects(()=>write(ba,4,'confirm',cash(0)),{code:'PT409'});assert.deepEqual(await read(ba),before)})
await check('reconfirmation does not replay withdrawals or erase histories',async()=>{await write(ba,pa.revision,'confirm',cash(105000));pa=await read(ba);assert.deepEqual(totals(pa),[105000,100000,5000]);assert.equal(pa.withdrawals.length,1);assert.equal(pa.snapshots.length,3)})
await check('edit keeps its prior allocation and does not change cash',async()=>{const stock=pa.allocations.find(x=>x.name==='Stock');await write(ba,pa.revision,'allocation',{...allocation('Stock',60000,'Replacement stock'),allocation_id:stock.id});pa=await read(ba);assert.equal(pa.events[0].previous_allocation.amount_cents,70000);assert.equal(totals(pa)[0],105000)})
await check('cancellation releases allocation without adding income',async()=>{await write(ba,pa.revision,'cancel',{allocation_id:pa.allocations.find(x=>x.name==='Stock').id,note:'Cancelled'});pa=await read(ba);assert.deepEqual(totals(pa),[105000,30000,75000])})
await check('overallocated plans keep their negative balance',async()=>{await write(ba,pa.revision,'confirm',cash(10000));pa=await read(ba);assert.equal(totals(pa)[2],-20000)})
await check('correction appends history and confirms actual cash',async()=>{await write(ba,pa.revision,'correct_withdrawal',{...withdrawal,amount_cents:10000,cash_cents:110000,corrects_id:withdrawalKey,correction_reason:'Wrong amount'});pa=await read(ba);assert.equal(pa.withdrawals.length,2);assert.equal(pa.withdrawals.find(w=>w.id===withdrawalKey).amount_cents,15000);assert.equal(totals(pa)[0],110000)})
await check('a completed entry cannot be silently corrected twice',()=>assert.rejects(()=>write(ba,pa.revision,'correct_withdrawal',{...withdrawal,corrects_id:withdrawalKey,correction_reason:'Again'})))
await check('failed invalid writes are atomic and never interpreted as zero',async()=>{const before=await read(ba);for(const bad of [null,-1,0.5,'',100000001])await assert.rejects(()=>write(ba,pa.revision,'confirm',cash(bad)));await assert.rejects(()=>write(ba,pa.revision,'withdrawal',{...withdrawal,confirmed:false}));await assert.rejects(()=>write(ba,pa.revision,'allocation',allocation('',1)));await assert.rejects(()=>write(ba,pa.revision,'allocation',allocation('Bad',1,'Tax')));await assert.rejects(()=>write(ba,pa.revision,'withdrawal',{...withdrawal,withdrawal_date:'2100-01-01'}));assert.deepEqual(await read(ba),before)})
await check('changed business or allocation identifiers cannot cross ownership',async()=>{await assert.rejects(()=>read(bb),{code:'42501'});await assert.rejects(()=>write(bb,pb.revision,'confirm',cash(0)),{code:'42501'});await assert.rejects(()=>write(ba,pa.revision,'settle',{allocation_id:pb.allocations[0].id,cash_cents:0,confirmed:true,note:''}),{code:'42501'});await assert.rejects(()=>write(ba,pa.revision,'allocation',{...allocation('Attack',1),allocation_id:pb.allocations[0].id}),{code:'42501'});await assert.rejects(()=>write(ba,pa.revision,'confirm',{...cash(0),business_id:bb}),{code:'22023'})})
const tables=['money_plan_state','money_plan_events','money_allocations','money_cash_snapshots','money_withdrawals']
await check('all five tables deny direct create/update/delete and business ID reassignment',async()=>{for(const t of tables){assert.equal((await db.query(`select * from public.${t} where business_id=$1`,[bb])).rows.length,0);await assert.rejects(()=>db.query(`insert into public.${t} default values`),{code:'42501'});await assert.rejects(()=>db.query(`update public.${t} set business_id=$1`,[bb]),{code:'42501'});await assert.rejects(()=>db.query(`delete from public.${t}`),{code:'42501'})}})
await check('sales, expenses, stock and profit inputs remain exactly unchanged',async()=>assert.deepEqual((await one('select public.get_workspace() w')).w,originalWorkspace))
await as(b)
await check('D: settlement and R1000 snapshot save atomically, leaving R200',async()=>{await write(bb,pb.revision,'settle',{allocation_id:pb.allocations.find(x=>x.name==='Bills').id,cash_cents:100000,note:'Paid',confirmed:true});pb=await read(bb);assert.deepEqual(totals(pb),[100000,80000,20000]);assert.equal(pb.snapshots.length,2);assert.equal((await one('select count(*)::integer as n from public.expenses')).n,0)})
await check('B cannot read A history or correct A withdrawal',async()=>{for(const t of tables)assert.equal((await db.query(`select * from public.${t} where business_id=$1`,[ba])).rows.length,0);await assert.rejects(()=>write(bb,pb.revision,'correct_withdrawal',{...withdrawal,corrects_id:withdrawalKey,correction_reason:'Attack'}),{code:'42501'})})
await as(null)
await check('anonymous private table reads and RPC calls are denied',async()=>{for(const t of tables)await assert.rejects(()=>db.query(`select * from public.${t}`),{code:'42501'});await assert.rejects(()=>read(ba),{code:'42501'});await assert.rejects(()=>write(ba,pa.revision,'confirm',cash(0)),{code:'42501'})})
await db.exec('set role authenticated')
await check('privileged function explicitly rejects null authenticated identity',()=>assert.rejects(()=>write(ba,pa.revision,'confirm',cash(0)),{code:'42501'}))
await db.close();console.log(`\n${passed} Money Split embedded PostgreSQL checks passed. Not a hosted Auth/API or multi-connection test.`)
