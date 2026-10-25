// Writes Money Split fixtures only in the explicitly selected disposable project.
// Existing sales/products/expenses are read and compared, never changed.
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { liveConfig } from './live-config.mjs'
async function run() {
  const config = liveConfig()
  if (new URL(config.url).hostname !== 'ekwwyxrjdqrigfggncff.supabase.co') throw new Error('Money tests are restricted to the dedicated bizbridge-sa-test project. Review this guard before selecting a different disposable environment.')
  const client = () => createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } })
  const a=client(), b=client(), anon=client(), uuid=()=>crypto.randomUUID()
  let passed=0
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  async function good(p) { const r=await p; if(r.error)throw new Error(`Unexpected API error (${r.error.code ?? 'network'}). No response body logged.`);return r.data }
  async function denied(p,code='42501') { const r=await p;assert.equal(r.error?.code,code,`Expected database code ${code}; a network failure is not an access-control pass.`) }
  async function check(name,fn) { try { await fn() } catch { throw new Error(`FAILED: ${name}. Response bodies and credentials are deliberately not logged.`) };console.log(`PASS ${name}`);passed++ }
  const read=(c,id)=>good(c.rpc('get_money_plan',{p_business_id:id}))
  const write=(c,id,revision,kind,payload,key=uuid())=>c.rpc('change_money_plan',{p_business_id:id,p_request_id:key,p_expected_revision:revision,p_kind:kind,p_payload:payload})
  const cash=cash_cents=>({cash_cents,note:'Isolated fictional Money Split test'})
  const allocation=(name,amount_cents,category='Other')=>({allocation_id:null,name,amount_cents,category,due_date:null,note:'Illustrative only'})
  const w={amount_cents:15000,cash_cents:105000,withdrawal_date:today,note:'Fictional withdrawal',confirmed:true,corrects_id:null,correction_reason:''}
  const totals=p=>{const allocated=p.allocations.filter(x=>x.status==='active').reduce((s,x)=>s+x.amount_cents,0);return [p.snapshots[0]?.cash_cents ?? null,allocated,p.snapshots.length?p.snapshots[0].cash_cents-allocated:null]}
  const workspace=c=>good(c.rpc('get_workspace'))
  const tables=['money_plan_state','money_plan_events','money_allocations','money_cash_snapshots','money_withdrawals']
  try {
    await good(a.auth.signInWithPassword({email:config.emailA,password:config.passwordA}))
    await good(b.auth.signInWithPassword({email:config.emailB,password:config.passwordB}))
    const originalA=await workspace(a),originalB=await workspace(b),ba=originalA.business?.id,bb=originalB.business?.id
    if(!ba||!bb||ba===bb||originalA.business.category!=='Isolated test fixtures'||originalB.business.category!=='Isolated test fixtures'||originalA.business.name!=='Isolated test business A'||originalB.business.name!=='Isolated test business B')throw new Error('Only the existing isolated fixture businesses may be used. No money records were written.')
    const resume=process.argv.includes('--resume-after-conflict')
    // Preflight BOTH accounts before any mutation. Never reset a nonempty plan.
    const existingA=await read(a,ba),existingB=await read(b,bb)
    if(resume) {
      // Narrow recovery for the first test run interrupted by the documented
      // PostgREST 40001 retry bug. This cannot reset or reuse arbitrary plans.
      assert.equal(existingA.revision,8,'Recovery requires the exact interrupted A fixture.')
      assert.equal(existingB.revision,6,'Recovery requires the exact interrupted B fixture.')
      assert.deepEqual(existingA.events.map(e=>e.kind).reverse(),['confirm','allocation','allocation','allocation','withdrawal','confirm','withdrawal','confirm'])
      assert.deepEqual(existingB.events.map(e=>e.kind).reverse(),['confirm','allocation','allocation','allocation','settle','withdrawal'])
      assert.equal(existingA.withdrawals.length,2);assert.equal(existingB.withdrawals.length,1)
      assert.ok([...existingA.allocations,...existingB.allocations].every(x=>x.note==='Illustrative only'))
    } else if(existingA.revision!==0||existingB.revision!==0)throw new Error('Money Split fixtures were not written: a selected test business already has a money plan. Use an explicitly approved fresh test environment; never reset existing histories.')
    async function seed(c,id) { let revision=await good(write(c,id,0,'confirm',cash(120000)));for(const [name,amount,category] of [['Stock',70000,'Replacement stock'],['Bills',20000,'Upcoming bills'],['Buffer',10000,'Emergency buffer']])revision=await good(write(c,id,revision,'allocation',allocation(name,amount,category)));return read(c,id) }
    let pa=resume?existingA:await seed(a,ba),pb=resume?existingB:await seed(b,bb)
    const key=resume?pa.events.find(e=>e.revision===5).id:uuid()
    if(!resume) {
    await check('A: R1200 cash / R1000 allocated / R200 unallocated',()=>assert.deepEqual(totals(pa),[120000,100000,20000]))
    await check('B: preview has R200 shortfall and saves nothing',async()=>{const before=await read(a,ba);assert.equal(totals(before)[2]-40000,-20000);assert.deepEqual(await read(a,ba),before)})
    await check('C: completed R150 withdrawal plus R1050 snapshot, no double deduction',async()=>{await good(write(a,ba,pa.revision,'withdrawal',w,key));pa=await read(a,ba);assert.deepEqual(totals(pa),[105000,100000,5000]);assert.equal(pa.withdrawals.length,1)})
    await check('persisted retry key prevents duplicate withdrawal and rejects changed payload',async()=>{await good(write(a,ba,4,'withdrawal',w,key));assert.equal((await read(a,ba)).withdrawals.length,1);await denied(write(a,ba,4,'withdrawal',{...w,amount_cents:1},key),'22023')})
    await check('reconfirming cash preserves withdrawals and allocations',async()=>{await good(write(a,ba,pa.revision,'confirm',cash(105000)));pa=await read(a,ba);assert.deepEqual(totals(pa),[105000,100000,5000]);assert.equal(pa.withdrawals.length,1)})
    await check('D: settle R200 bill with R1000 confirmed cash; no double subtraction',async()=>{await good(write(b,bb,pb.revision,'settle',{allocation_id:pb.allocations.find(x=>x.name==='Bills').id,cash_cents:100000,note:'Fictional payment',confirmed:true}));pb=await read(b,bb);assert.deepEqual(totals(pb),[100000,80000,20000])})
    // Make every B table nonempty so isolation assertions cannot pass vacuously.
    await good(write(b,bb,pb.revision,'withdrawal',{...w,amount_cents:10000,cash_cents:90000}));pb=await read(b,bb)
    await check('six simultaneous retries commit exactly one event/snapshot/withdrawal',async()=>{const before=await read(a,ba),same=uuid();const outcomes=await Promise.all(Array.from({length:6},()=>write(a,ba,before.revision,'withdrawal',w,same)));assert.ok(outcomes.every(r=>!r.error));pa=await read(a,ba);assert.equal(pa.events.length,before.events.length+1);assert.equal(pa.snapshots.length,before.snapshots.length+1);assert.equal(pa.withdrawals.length,before.withdrawals.length+1)})
    }
    await check('concurrent independent updates accept one and reject stale revisions atomically',async()=>{const before=await read(a,ba);const outcomes=await Promise.all(Array.from({length:6},(_,i)=>write(a,ba,before.revision,'confirm',cash(100000+i))));assert.equal(outcomes.filter(r=>!r.error).length,1);assert.ok(outcomes.filter(r=>r.error).every(r=>r.error.code==='PT409'));pa=await read(a,ba);assert.equal(pa.events.length,before.events.length+1);assert.equal(pa.snapshots.length,before.snapshots.length+1)})
    await check('allocation edits retain prior values and do not change cash',async()=>{const before=await read(a,ba),stock=before.allocations.find(x=>x.name==='Stock');await good(write(a,ba,before.revision,'allocation',{...allocation('Stock revised',65000),allocation_id:stock.id}));pa=await read(a,ba);assert.equal(pa.events[0].previous_allocation.amount_cents,70000);assert.deepEqual(pa.snapshots,before.snapshots)})
    await check('cancellation releases only its planning amount',async()=>{const before=await read(a,ba);await good(write(a,ba,before.revision,'cancel',{allocation_id:before.allocations.find(x=>x.name==='Stock revised').id,note:'Cancelled'}));pa=await read(a,ba);assert.deepEqual(pa.snapshots,before.snapshots);assert.equal(totals(pa)[1],30000)})
    await check('overallocated plan exposes the actual negative balance',async()=>{await good(write(a,ba,pa.revision,'confirm',cash(10000)));pa=await read(a,ba);assert.equal(totals(pa)[2],-20000)})
    await check('correction appends linked immutable history with actual current cash',async()=>{const before=await read(a,ba);await good(write(a,ba,before.revision,'correct_withdrawal',{...w,amount_cents:10000,cash_cents:110000,corrects_id:key,correction_reason:'Fictional correction'}));pa=await read(a,ba);assert.equal(pa.withdrawals.length,before.withdrawals.length+1);assert.deepEqual(pa.withdrawals.find(x=>x.id===key),before.withdrawals.find(x=>x.id===key));assert.equal(totals(pa)[0],110000)})
    await check('invalid values and missing explicit confirmation leave no partial records',async()=>{const before=await read(a,ba);for(const invalid of [null,-1,0.1,'',100000001])await denied(write(a,ba,before.revision,'confirm',cash(invalid)),'22023');await denied(write(a,ba,before.revision,'withdrawal',{...w,confirmed:false}),'22023');assert.deepEqual(await read(a,ba),before)})
    for(const [owner,own,foreign,theirs] of [[a,ba,bb,pb],[b,bb,ba,pa]])await check(`two-way isolation for ${owner===a?'A':'B'}: private reads, changed IDs and direct mutations`,async()=>{
      const current=await read(owner,own)
      for(const table of tables){assert.deepEqual(await good(owner.from(table).select('*').eq('business_id',foreign)),[]);await denied(owner.from(table).insert({business_id:foreign}));await denied(owner.from(table).update({business_id:foreign}).eq('business_id',own));await denied(owner.from(table).delete().eq('business_id',foreign))}
      await denied(owner.rpc('get_money_plan',{p_business_id:foreign}));await denied(write(owner,foreign,theirs.revision,'confirm',cash(0)))
      const target=theirs.allocations.find(x=>x.status==='active').id
      for(const kind of ['cancel','settle'])await denied(write(owner,own,current.revision,kind,{allocation_id:target,note:'Attack',...(kind==='settle'?{cash_cents:0,confirmed:true}:{})}))
      await denied(write(owner,own,current.revision,'allocation',{...allocation('Attack',1),allocation_id:target}))
      await denied(write(owner,own,current.revision,'correct_withdrawal',{...w,corrects_id:theirs.withdrawals[0].id,correction_reason:'Attack'}))
      await denied(write(owner,own,current.revision,'confirm',{...cash(0),business_id:foreign}),'22023')
    })
    await check('unauthenticated table and function access is denied',async()=>{for(const t of tables)await denied(anon.from(t).select('*'));await denied(anon.rpc('get_money_plan',{p_business_id:ba}));await denied(write(anon,ba,pa.revision,'confirm',cash(0)))})
    await check('saved plans persist through a fresh authenticated client',async()=>{const fresh=client();try{await good(fresh.auth.signInWithPassword({email:config.emailA,password:config.passwordA}));assert.deepEqual(await read(fresh,ba),await read(a,ba))}finally{await fresh.auth.signOut()}})
    await check('all original sales, expenses, stock and profit inputs remain unchanged',async()=>{assert.deepEqual(await workspace(a),originalA);assert.deepEqual(await workspace(b),originalB)})
    await check('logout prevents access to private Money Split records',async()=>{await a.auth.signOut();await denied(a.rpc('get_money_plan',{p_business_id:ba}))})
    console.log(`\n${passed} real Money Split API/security/concurrency checks passed${resume?' in the guarded continuation (7 initial checks previously passed)':''}. Only isolated Money Split fixtures were written; existing business transactions are unchanged.`)
  } finally { await Promise.allSettled([a.auth.signOut(),b.auth.signOut()]) }
}
run().catch(e=>{console.error(e instanceof Error?e.message:'Money Split API tests failed.');process.exitCode=1})
