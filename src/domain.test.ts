import { describe, expect, it } from 'vitest'
import { businessToday, cents, emptyWorkspace, integer, lowStock, metrics, periodStart, readiness, validDate, validateExpense, validateProduct, validateProfile, validateSale } from './domain'
import { demoMutation, demoSale, sampleWorkspace } from './demo'
const fixture = () => { const d = sampleWorkspace(); d.products = [d.products[0]]; d.products[0].stock = 20; d.sales = []; d.expenses = []; return d }
const saleInput = (id: string, quantity = 2) => ({ product_id: id, quantity, sale_date: businessToday(), payment_method: 'Cash', idempotency_key: crypto.randomUUID() })
describe('money and inputs', () => {
  it.each([['120',12000],['70.01',7001],['0.29',29],['000.09',9]])('parses %s as exact integer cents', (v,n) => expect(cents(v)).toBe(n))
  it.each(['-1','NaN','Infinity','1.001','1e4','1,20','','1000000.01'])('rejects invalid amount %s', v => expect(() => cents(v)).toThrow())
  it('distinguishes missing cost from zero', () => { expect(cents('',true)).toBeNull(); expect(cents('0',true)).toBe(0) })
  it.each(['1.2','', '2e2', 'NaN', '-1'])('rejects invalid stock %s', v => expect(() => integer(v)).toThrow())
  it('validates Johannesburg calendar dates', () => { expect(businessToday(new Date('2026-01-31T22:30:00Z'))).toBe('2026-02-01'); expect(() => validDate('2025-02-30')).toThrow(); expect(() => validDate('2100-01-01')).toThrow(); expect(() => validDate('1999-01-01')).toThrow() })
  it('filters month and rolling days at year boundaries', () => { expect(periodStart('month','2026-01-03')).toBe('2026-01-01'); expect(periodStart('30','2026-01-03')).toBe('2025-12-05') })
  it('rejects unknown categories and invalid profile/product fields', () => {
    expect(() => validateExpense({ id:'x', amount_cents:3000,expense_date:businessToday(),category:'Inventory',note:'' })).toThrow()
    expect(() => validateProduct({name:'',sku:null,price_cents:12000,cost_cents:7000,opening_stock:20,low_stock_threshold:5})).toThrow()
    expect(() => validateProfile({...sampleWorkspace().business!, stage:'Invalid'})).toThrow()
    expect(() => validateSale({...saleInput('x'),payment_method:'Fake'})).toThrow()
  })
})
describe('workflow and immutable history', () => {
  it('meets the R120/R70/20 units acceptance scenario', () => {
    const d = fixture(); const sold = demoSale(d,saleInput(d.products[0].id))
    const result = demoMutation(sold, { kind:'expense',input:{id:crypto.randomUUID(),amount_cents:3000,expense_date:businessToday(),category:'Transport',note:''} })
    expect(result.products[0].stock).toBe(18)
    expect(metrics(result.sales,result.expenses)).toMatchObject({revenue:24000,cogs:14000,grossProfit:10000,operatingExpenses:3000,operatingProfit:7000})
  })
  it('returns the saved sale on a retry without reducing stock twice', () => { const d = fixture(), input = saleInput(d.products[0].id); const next = demoSale(d,input); expect(demoSale(next,input)).toEqual(next); expect(next.sales).toHaveLength(1) })
  it('rejects reuse of a key with changed input', () => { const d = fixture(), input = saleInput(d.products[0].id); expect(() => demoSale(demoSale(d,input),{...input,quantity:3})).toThrow(/different sale/) })
  it('rejects insufficient stock without mutating any record', () => { const d = fixture(), copy = structuredClone(d); expect(() => demoSale(d,saleInput(d.products[0].id,21))).toThrow(/Insufficient/); expect(d).toEqual(copy) })
  it('keeps price, cost and name snapshots after edits and archive', () => {
    const d = fixture(); let next = demoSale(d,saleInput(d.products[0].id))
    next = demoMutation(next,{kind:'product',id:d.products[0].id,input:{name:'Renamed',sku:null,price_cents:99900,cost_cents:12300,opening_stock:0,low_stock_threshold:5}})
    next = demoMutation(next,{kind:'archive',id:d.products[0].id,archived:true})
    expect(next.sales[0]).toMatchObject({unit_price_cents:12000,unit_cost_cents:7000,total_cents:24000,product_name:d.products[0].name})
    expect(() => demoSale(next,saleInput(d.products[0].id))).toThrow(/active product/)
  })
  it('marks profit and COGS incomplete when a cost snapshot is missing', () => { const d = fixture(); d.products[0].cost_cents = null; const next=demoSale(d,saleInput(d.products[0].id)); expect(metrics(next.sales,[])).toMatchObject({revenue:24000,cogs:null,grossProfit:null,operatingProfit:null}); expect(metrics(next.sales,[]).missingCosts).toHaveLength(1) })
  it('treats an explicit zero cost as known', () => { const d=fixture(); d.products[0].cost_cents=0; expect(metrics(demoSale(d,saleInput(d.products[0].id)).sales,[]).grossProfit).toBe(24000) })
  it('does not silently overflow aggregate money', () => { const sale=sampleWorkspace().sales[0]; expect(() => metrics([{...sale,total_cents:Number.MAX_SAFE_INTEGER},{...sale,total_cents:1}],[])).toThrow(/supported money range/) })
  it('records controlled stock adjustments and rejects negative stock', () => { const d=fixture(), id=d.products[0].id; expect(() => demoMutation(d,{kind:'adjust',id,delta:-21,reason:'Damage',key:crypto.randomUUID()})).toThrow(); const action={kind:'adjust' as const,id,delta:5,reason:'Restocked',key:crypto.randomUUID()}; const next=demoMutation(d,action); expect(next.products[0].stock).toBe(25); expect(demoMutation(next,action)).toEqual(next) })
  it('deduplicates operating expense requests', () => { const d=fixture(), action={kind:'expense' as const,input:{id:crypto.randomUUID(),amount_cents:3000,expense_date:businessToday(),category:'Transport',note:''}}; const next=demoMutation(d,action); expect(demoMutation(next,action).expenses).toHaveLength(1) })
})
describe('explained readiness rules', () => {
  it('does not fabricate a score for an empty business', () => { expect(readiness(emptyWorkspace()).score).toBeNull(); const d=fixture(); d.products=[]; expect(readiness(d).score).toBeNull() })
  it('shows the exact contributions', () => { const d=fixture(); d.business!.records_reviewed=true; d.business!.receipts_kept=true; d.business!.documents_reviewed=true; expect(readiness(d).score).toBe(100); expect(readiness(d).indicators.map(i => i.earned)).toEqual([20,35,20,25]) })
  it('does not reward revenue or optional location', () => { const d=fixture(), before=readiness(d).score; d.sales=sampleWorkspace().sales; d.business!.town=''; d.business!.province=''; expect(readiness(d).score).toBe(before) })
  it('decreases coverage for missing costs and thresholds', () => { const d=fixture(); d.products[0].cost_cents=null; d.products[0].low_stock_threshold=null; expect(readiness(d).indicators.map(i => i.earned)).toEqual([20,0,0,8]) })
  it('only flags active products at or below their threshold', () => { const d=fixture(); d.products[0].stock=5; expect(lowStock(d.products)).toHaveLength(1); d.products[0].archived=true; expect(lowStock(d.products)).toHaveLength(0) })
})
