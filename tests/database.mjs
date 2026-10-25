// Opt-in integration against a disposable hosted project. No admin key.
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { liveConfig } from './live-config.mjs'

async function run() {
  const config = liveConfig()
  const client = () => createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } })
  const a = client(), b = client(), anonymous = client()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const uuid = () => crypto.randomUUID()
  let passed = 0
  async function good(request) {
    const result = await request
    // Never serialize SDK results: Auth results can contain session tokens.
    if (result.error) throw new Error(`Unexpected API error (${result.status || 'network'}). Check connectivity, migration and confirmed test accounts.`)
    return result.data
  }
  async function rejected(request, code = '42501', expectedText) {
    const result = await request
    assert.equal(result.error?.code, code, `Expected database rejection ${code}; network failures and unrelated validation errors do not count.`)
    if (expectedText) assert.ok(result.error.message.includes(expectedText), 'Unexpected database rejection reason.')
  }
  async function check(name, fn) {
    try { await fn() } catch { throw new Error(`FAILED: ${name}. Response bodies and credentials are deliberately not logged.`) }
    passed++; console.log(`PASS ${name}`)
  }
  const workspace = c => good(c.rpc('get_workspace'))
  const product = (c, id, name, stock = 20, cost = 7000) => good(c.rpc('save_product', { p_business_id: id, p_product_id: null, p_name: name, p_sku: null, p_price_cents: 12000, p_cost_cents: cost, p_opening_stock: stock, p_threshold: 5 }))
  const sale = (c, business, id, quantity, key = uuid()) => c.rpc('record_sale', { p_business_id: business, p_product_id: id, p_quantity: quantity, p_sale_date: today, p_payment_method: 'Cash', p_idempotency_key: key })
  const expense = (c, business) => c.rpc('record_expense', { p_business_id: business, p_id: uuid(), p_amount_cents: 3000, p_expense_date: today, p_category: 'Transport', p_note: 'Isolated live-test expense' })
  try {
    const authA = await good(a.auth.signInWithPassword({ email: config.emailA, password: config.passwordA }))
    const authB = await good(b.auth.signInWithPassword({ email: config.emailB, password: config.passwordB }))
    assert.notEqual(authA.user.id, authB.user.id, 'Two separate accounts are required.')
    for (const c of [a, b]) assert.equal((await good(c.from('businesses').select('id'))).length, 0, 'Only fresh test accounts are allowed. Existing business found; no fixtures were written.')
    const createBusiness = (c, owner, name) => good(c.from('businesses').insert({ owner_id: owner, name, category: 'Isolated test fixtures', stage: 'Just started' }).select().single())
    const ba = await createBusiness(a, authA.user.id, 'Isolated test business A'), bb = await createBusiness(b, authB.user.id, 'Isolated test business B')
    const pa = await product(a, ba.id, 'Acceptance cleaner'), pb = await product(b, bb.id, 'Private cleaner B')
    // Populate all B tables so isolation assertions cannot pass vacuously.
    await good(sale(b, bb.id, pb.id, 1)); await good(expense(b, bb.id))
    const key = uuid()
    await check('acceptance stock 18 / revenue R240 / COGS R140 / gross R100 / operating R70', async () => {
      await good(sale(a, ba.id, pa.id, 2, key)); await good(expense(a, ba.id))
      const w = await workspace(a), s = w.sales[0]
      assert.equal(w.products.find(p => p.id === pa.id).stock, 18)
      assert.equal(s.total_cents, 24000); assert.equal(s.quantity * s.unit_cost_cents, 14000)
      assert.equal(s.total_cents - s.quantity * s.unit_cost_cents, 10000)
      assert.equal(s.total_cents - s.quantity * s.unit_cost_cents - w.expenses[0].amount_cents, 7000)
    })
    await check('completed-sale retry is idempotent and changed payload is rejected', async () => {
      await good(sale(a, ba.id, pa.id, 2, key))
      await rejected(sale(a, ba.id, pa.id, 3, key), 'P0001', 'Retry key belongs to a different sale')
      const w = await workspace(a); assert.equal(w.sales.length, 1); assert.equal(w.products[0].stock, 18)
    })
    await check('six simultaneous first-time requests with one key create one sale', async () => {
      const p = await product(a, ba.id, 'Concurrent retry fixture', 10), freshKey = uuid()
      const results = await Promise.all(Array.from({ length: 6 }, () => good(sale(a, ba.id, p.id, 2, freshKey))))
      assert.equal(new Set(results.map(r => r.id)).size, 1)
      const w = await workspace(a)
      assert.equal(w.products.find(x => x.id === p.id).stock, 8)
      assert.equal(w.sales.filter(x => x.product_id === p.id).length, 1)
      assert.equal(w.movements.filter(x => x.product_id === p.id && x.delta < 0).length, 1)
    })
    await check('insufficient stock rolls back sale, stock and movement', async () => {
      const before = await workspace(a)
      await rejected(sale(a, ba.id, pa.id, 99), 'P0001', 'Insufficient stock')
      assert.deepEqual(await workspace(a), before)
    })
    await check('twelve concurrent independent requests cannot oversell five units', async () => {
      const p = await product(a, ba.id, 'Oversell fixture', 5)
      const outcomes = await Promise.all(Array.from({ length: 12 }, () => sale(a, ba.id, p.id, 1)))
      assert.equal(outcomes.filter(r => !r.error).length, 5)
      for (const r of outcomes.filter(r => r.error)) { assert.equal(r.error.code, 'P0001'); assert.ok(r.error.message.includes('Insufficient stock')) }
      const w = await workspace(a)
      assert.equal(w.products.find(x => x.id === p.id).stock, 0)
      assert.equal(w.sales.filter(x => x.product_id === p.id).length, 5)
      assert.equal(w.movements.filter(x => x.product_id === p.id && x.delta < 0).length, 5)
    })
    await check('historical price, cost and name survive product changes', async () => {
      await good(a.rpc('save_product', { p_business_id: ba.id, p_product_id: pa.id, p_name: 'Renamed fixture', p_sku: null, p_price_cents: 99900, p_cost_cents: 100, p_opening_stock: 0, p_threshold: 5 }))
      const s = (await workspace(a)).sales.find(x => x.idempotency_key === key)
      assert.equal(s.total_cents, 24000); assert.equal(s.unit_cost_cents, 7000); assert.equal(s.product_name, 'Acceptance cleaner')
    })
    await check('unknown cost stays NULL in a saved sale', async () => {
      const p = await product(a, ba.id, 'Unknown cost fixture', 3, null)
      assert.equal((await good(sale(a, ba.id, p.id, 1))).unit_cost_cents, null)
    })
    await check('two-way isolation hides populated tables and aggregate workspaces', async () => {
      for (const [owner, attacker, id] of [[a, b, ba.id], [b, a, bb.id]]) {
        for (const table of ['businesses', 'products', 'sales', 'expenses', 'stock_movements']) {
          const field = table === 'businesses' ? 'id' : 'business_id'
          assert.ok((await good(owner.from(table).select('id').eq(field, id))).length > 0, 'Isolation fixture must exist.')
          assert.equal((await good(attacker.from(table).select('*').eq(field, id))).length, 0)
        }
        const w = await workspace(attacker)
        assert.notEqual(w.business.id, id)
        for (const rows of [w.products, w.sales, w.expenses, w.movements]) assert.ok(rows.every(r => r.business_id !== id))
      }
    })
    await check('two-way changed-ID mutation attacks are rejected', async () => {
      for (const [c, own, other, p] of [[a, ba.id, bb.id, pb.id], [b, bb.id, ba.id, pa.id]]) {
        assert.equal((await good(c.from('businesses').update({ name: 'Attack' }).eq('id', other).select('id'))).length, 0)
        await rejected(sale(c, own, p, 1)); await rejected(sale(c, other, p, 1))
        await rejected(c.rpc('archive_product', { p_business_id: own, p_product_id: p, p_archived: true }))
        await rejected(c.rpc('archive_product', { p_business_id: other, p_product_id: p, p_archived: true }))
        await rejected(c.rpc('adjust_stock', { p_business_id: own, p_product_id: p, p_delta: 1, p_reason: 'Attack', p_idempotency_key: uuid() }))
        await rejected(c.rpc('save_product', { p_business_id: own, p_product_id: p, p_name: 'Attack', p_sku: null, p_price_cents: 1, p_cost_cents: 1, p_opening_stock: 0, p_threshold: 1 }))
        await rejected(expense(c, other))
      }
      assert.equal((await workspace(b)).business.name, bb.name)
      assert.equal((await workspace(b)).products.find(p => p.id === pb.id).stock, 19)
    })
    await check('valid direct writes cannot bypass transaction restrictions', async () => {
      await rejected(a.from('products').update({ stock: 999 }).eq('id', pa.id))
      await rejected(a.from('products').insert({ business_id: ba.id, name: 'Bypass', price_cents: 12000, cost_cents: 7000, stock: 20 }))
      await rejected(a.from('sales').insert({ business_id: ba.id, product_id: pa.id, product_name: 'Bypass', quantity: 1, unit_price_cents: 12000, unit_cost_cents: 7000, sale_date: today, payment_method: 'Cash', idempotency_key: uuid() }))
      await rejected(a.from('expenses').insert({ id: uuid(), business_id: ba.id, amount_cents: 100, expense_date: today, category: 'Other', note: '' }))
      await rejected(a.from('stock_movements').insert({ business_id: ba.id, product_id: pa.id, delta: 1, reason: 'Bypass' }))
      await rejected(a.from('sales').delete().eq('business_id', ba.id))
      await rejected(a.from('businesses').update({ owner_id: authB.user.id }).eq('id', ba.id))
    })
    await check('anonymous private reads and RPC mutations are rejected', async () => {
      for (const table of ['businesses', 'products', 'sales', 'expenses', 'stock_movements']) await rejected(anonymous.from(table).select('*'))
      await rejected(anonymous.rpc('get_workspace')); await rejected(sale(anonymous, ba.id, pa.id, 1)); await rejected(expense(anonymous, ba.id))
    })
    await check('saved records persist in a fresh authenticated client', async () => {
      const fresh = client()
      try { await good(fresh.auth.signInWithPassword({ email: config.emailA, password: config.passwordA })); assert.deepEqual(await workspace(fresh), await workspace(a)) }
      finally { await fresh.auth.signOut({ scope: 'local' }) }
    })
    await check('logout removes the session and denies subsequent private reads', async () => {
      await good(a.auth.signOut({ scope: 'local' }))
      assert.ok((await a.auth.getSession()).data.session === null, 'A session remained after logout.')
      await rejected(a.rpc('get_workspace'))
    })
    console.log(`\n${passed} live Supabase checks passed. Disposable fixtures remain for browser tests. No deployment occurred.`)
  } finally { await Promise.allSettled([a.auth.signOut({ scope: 'local' }), b.auth.signOut({ scope: 'local' })]) }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
