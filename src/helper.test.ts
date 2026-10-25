import { describe, expect, it } from 'vitest'
import { answerIntent, answerQuestion, helperScope, matchQuestion, topics, unsupportedMessage, type HelperContext } from './helper-guidance'
import { businessReport, businessToday, emptyWorkspace, incompleteProfitMessage, money, readiness } from './domain'
import { demoMutation, demoSale, sampleWorkspace } from './demo'
const context = (): HelperContext => ({ mode: 'demo', userId: null, data: sampleWorkspace(), loading: false, error: '', retrievedAt: '2026-10-25T10:00:00Z', period: 'month' })

describe('prepared question matching', () => {
  it.each(topics)('supports $question', t => expect(matchQuestion(t.question)).toEqual({ kind: 'answer', intent: t.id }))
  it.each([['add item', 'product'], ['record sale', 'sale'], ['business summary', 'summary'], ['low stock', 'stock'], ['restock', 'stock'], ['Explain gross profit', 'gross'], ['GROWTH GUIDE?', 'readiness']])('recognises %s', (q, intent) => expect(matchQuestion(q)).toEqual({ kind: 'answer', intent }))
  it('matches a specific stock question before the product keyword', () => expect(matchQuestion('Which products need restocking?')).toEqual({ kind: 'answer', intent: 'stock' }))
  it.each(['sales and expenses', 'add item and low stock'])('offers choices for ambiguous %s', q => expect(matchQuestion(q).kind).toBe('ambiguous'))
  it.each(['Write a poem', 'hello', 'wholesale weather', ''])('does not imply arbitrary understanding: %s', q => expect(answerQuestion(q, context()).paragraphs).toEqual([unsupportedMessage]))
  it.each(['sell 2 units', 'record a sale for me', 'delete my expenses', 'change stock to 99', 'add 3 products'])('refuses mutation: %s', q => expect(answerQuestion(q, context()).paragraphs[0]).toContain('read-only'))
  it('links only to existing screens, never form-submission URLs', () => {
    for (const t of topics) for (const a of answerIntent(t.id, context()).actions ?? []) expect(a.path).toMatch(/^\/(products(?:\?filter=(?:low|cost))?|sales|expenses|dashboard|settings|growth)$/)
  })
  it('keeps inventory out of operating expenses and examples labelled', () => {
    expect(answerIntent('expense', context()).paragraphs.join(' ')).toContain('deduct stock costs twice')
    expect(answerIntent('gross', context()).paragraphs.join(' ')).toContain('Illustrative example only')
  })
})
describe('authorised, current business answers', () => {
  it('matches all five dashboard values with its shared reporting function', () => {
    const c = context(), m = businessReport(c.data!, c.period).totals
    expect(answerIntent('summary', c).rows?.map(r => r.value)).toEqual([m.revenue, m.cogs, m.grossProfit, m.operatingExpenses, m.operatingProfit].map(n => money(n!)))
    expect(answerIntent('summary', c).source).toContain('Retrieved')
    expect(answerIntent('summary', c).source).toContain('Africa/Johannesburg')
  })
  it('shares reporting date boundaries and does not count out-of-period records', () => {
    const c = context(); c.data!.sales[0].sale_date = '2000-01-01'
    expect(answerIntent('summary', c).rows?.[0].value).toBe(money(0))
    c.period = 'all'; expect(answerIntent('summary', c).rows?.[0].value).toBe(money(24000))
  })
  it('uses the same incomplete-profit warning as the dashboard', () => {
    const c = context(); c.data!.sales[0].unit_cost_cents = null
    const reply = answerIntent('summary', c)
    expect(reply.rows?.filter(r => r.value === 'Incomplete')).toHaveLength(3)
    expect(reply.warning).toBe(incompleteProfitMessage(businessReport(c.data!, c.period).totals))
  })
  it('updates after a sale and expense without mutating the input while answering', () => {
    const c = context(), before = structuredClone(c.data)
    answerIntent('summary', c); answerIntent('stock', c); answerIntent('readiness', c)
    expect(c.data).toEqual(before)
    c.data = demoSale(c.data!, { product_id: c.data!.products[0].id, quantity: 2, sale_date: businessToday(), payment_method: 'Cash', idempotency_key: crypto.randomUUID() })
    c.data = demoMutation(c.data, { kind: 'expense', input: { id: crypto.randomUUID(), amount_cents: 3000, expense_date: businessToday(), category: 'Transport', note: '' } })
    expect(answerIntent('summary', c).rows?.map(r => r.value)).toEqual([48000,28000,20000,6000,14000].map(money))
  })
  it('distinguishes loaded empty data, missing profile, failed and loading data', () => {
    const c = context(); c.data!.sales = []; c.data!.expenses = []
    expect(answerIntent('summary', c).paragraphs.join(' ')).toContain('No sales or operating expenses')
    c.error = 'Request failed'; expect(answerIntent('summary', c).rows).toBeUndefined()
    expect(answerIntent('stock', c).paragraphs[0]).toContain('Unable to load stock')
    c.error = ''; c.loading = true; expect(answerIntent('summary', c).paragraphs[0]).toContain('still loading')
    c.loading = false; c.data = emptyWorkspace(); expect(answerIntent('summary', c).paragraphs[0]).toContain('Create your business profile')
    c.data = null; expect(answerIntent('summary', c).rows).toBeUndefined()
  })
  it('distinguishes no products, no low stock, no thresholds and archived products', () => {
    const c = context(); expect(answerIntent('stock', c).rows).toHaveLength(1)
    c.data!.products.forEach(p => { p.stock = 100 })
    expect(answerIntent('stock', c).paragraphs[0]).toContain('No low-stock products')
    expect(answerIntent('stock', c).paragraphs.join(' ')).toContain('no threshold')
    c.data!.products.forEach(p => { p.archived = true }); expect(answerIntent('stock', c).paragraphs[0]).toContain('No active products')
    c.data!.products = []; expect(answerIntent('stock', c).paragraphs[0]).toContain('No products yet')
  })
  it('reuses readiness factors and has no fabricated empty score', () => {
    const c = context(), expected = readiness(c.data!)
    const reply = answerIntent('readiness', c)
    expect(reply.title).toBe(`Readiness: ${expected.score}/100`)
    for (const i of expected.indicators) expect(reply.paragraphs.join(' ')).toContain(`${i.name}: ${i.earned}/${i.max}`)
    expect(reply.paragraphs.join(' ')).toContain('not a credit rating or funding approval')
    c.data!.products = []; expect(answerIntent('readiness', c).title).toBe('Readiness: not started')
  })
  it('never turns a calculation failure or unknown retrieval time into zeros', () => {
    const c = context(); c.data!.sales.push({ ...c.data!.sales[0], total_cents: Number.MAX_SAFE_INTEGER })
    expect(answerIntent('summary', c).rows).toBeUndefined()
    c.retrievedAt = null; expect(answerIntent('summary', c).rows).toBeUndefined()
  })
  it('requires authentication for real data, labels demo and checks identity', () => {
    const c = context(); expect(answerIntent('summary', c).source).toContain('DEMO MODE — fictional')
    c.mode = 'anonymous'; expect(answerIntent('summary', c).rows).toBeUndefined()
    c.mode = 'real'; c.userId = 'someone-else'; expect(answerIntent('summary', c).rows).toBeUndefined()
    c.userId = c.data!.business!.owner_id
    expect(answerIntent('summary', c).source).not.toContain('DEMO MODE')
  })
  it('changes conversation scope for logout, account, business and mode changes only', () => {
    const c = context(), key = helperScope(c)
    c.period = 'all'; c.retrievedAt = '2026-10-25T11:00:00Z'; expect(helperScope(c)).toBe(key)
    for (const next of [{ ...c, mode: 'anonymous' as const }, { ...c, mode: 'real' as const }, { ...c, userId: 'new-user' }, { ...c, data: { ...c.data!, business: { ...c.data!.business!, id: 'new-business' } } }]) expect(helperScope(next)).not.toBe(key)
  })
})
