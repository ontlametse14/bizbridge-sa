import { businessToday, emptyWorkspace, integer, textValue, validateExpense, validateProduct, validateProfile, validateSale, type ExpenseInput, type ProductInput, type ProfileInput, type SaleInput, type Workspace } from './domain'
import { applyMoneyRequest, emptyMoneyPlan, type MoneyPlan, type MoneyRequest } from './money-plan'
export const DEMO_STORAGE_KEY = 'bizbridge.demo.v1'
export const demoMoneyKey = (businessId: string) => `bizbridge.demo.money.v1.${businessId}`
export function readDemoMoney(businessId: string): MoneyPlan {
  const raw = localStorage.getItem(demoMoneyKey(businessId))
  const plan = raw ? JSON.parse(raw) as MoneyPlan : emptyMoneyPlan(businessId)
  if (plan.business_id !== businessId) throw new Error('The fictional money plan belongs to another demo business.')
  return plan
}
export async function mutateDemoMoney(businessId: string, request: MoneyRequest) {
  if (!navigator.locks) throw new Error('This preview needs a browser with Web Locks on localhost or HTTPS.')
  return navigator.locks.request(demoMoneyKey(businessId), () => {
    const next = applyMoneyRequest(readDemoMoney(businessId), request)
    localStorage.setItem(demoMoneyKey(businessId), JSON.stringify(next))
    return next
  })
}
const uuid = () => crypto.randomUUID()
export function sampleWorkspace(): Workspace {
  const id = uuid(), p = uuid(), today = businessToday(), now = new Date().toISOString()
  return {
    business: { id, owner_id: 'demo', name: 'Demo Clean Supplies', category: 'Household cleaning products', town: 'Rustenburg', province: 'North West', stage: 'Just started', records_reviewed: true, receipts_kept: false, documents_reviewed: false },
    products: [
      { id: p, business_id: id, name: 'All-purpose cleaner · 5L', sku: 'DEMO-AP5', price_cents: 12000, cost_cents: 7000, stock: 18, low_stock_threshold: 5, archived: false },
      { id: uuid(), business_id: id, name: 'Dishwashing liquid · 1L', sku: 'DEMO-DW1', price_cents: 3500, cost_cents: 1900, stock: 4, low_stock_threshold: 5, archived: false },
      { id: uuid(), business_id: id, name: 'Laundry liquid · 2L', sku: 'DEMO-LL2', price_cents: 8500, cost_cents: null, stock: 12, low_stock_threshold: null, archived: false },
    ],
    sales: [{ id: uuid(), business_id: id, product_id: p, product_name: 'All-purpose cleaner · 5L', quantity: 2, unit_price_cents: 12000, unit_cost_cents: 7000, total_cents: 24000, sale_date: today, payment_method: 'Cash', idempotency_key: uuid(), created_at: now }],
    expenses: [{ id: uuid(), business_id: id, amount_cents: 3000, category: 'Transport', expense_date: today, note: 'Illustrative local delivery trip', created_at: now }],
    movements: [{ id: uuid(), business_id: id, product_id: p, delta: 20, reason: 'Illustrative opening stock', created_at: now }, { id: uuid(), business_id: id, product_id: p, delta: -2, reason: 'Completed illustrative sale', created_at: now }],
  }
}
export function demoSale(data: Workspace, input: SaleInput): Workspace {
  validateSale(input)
  const existing = data.sales.find(s => s.idempotency_key === input.idempotency_key)
  if (existing) {
    if (existing.product_id !== input.product_id || existing.quantity !== input.quantity || existing.sale_date !== input.sale_date || existing.payment_method !== input.payment_method) throw new Error('This retry key belongs to a different sale. Review the saved transaction.')
    return data
  }
  const product = data.products.find(p => p.id === input.product_id && p.business_id === data.business?.id && !p.archived)
  if (!product) throw new Error('Choose an active product from this business.')
  if (product.stock < input.quantity) throw new Error('Insufficient stock. No sale was saved.')
  const next = structuredClone(data), now = new Date().toISOString()
  next.products.find(p => p.id === product.id)!.stock -= input.quantity
  next.sales.unshift({ ...input, id: uuid(), business_id: product.business_id, product_name: product.name, unit_price_cents: product.price_cents, unit_cost_cents: product.cost_cents, total_cents: product.price_cents * input.quantity, created_at: now })
  next.movements.unshift({ id: uuid(), business_id: product.business_id, product_id: product.id, delta: -input.quantity, reason: 'Completed sale', created_at: now })
  return next
}
export type Mutation =
  | { kind: 'profile'; input: ProfileInput }
  | { kind: 'product'; id?: string; input: ProductInput }
  | { kind: 'archive'; id: string; archived: boolean }
  | { kind: 'adjust'; id: string; delta: number; reason: string; key: string }
  | { kind: 'sale'; input: SaleInput }
  | { kind: 'expense'; input: ExpenseInput }
export function demoMutation(data: Workspace, action: Mutation): Workspace {
  if (action.kind === 'sale') return demoSale(data, action.input)
  const next = structuredClone(data)
  if (action.kind === 'profile') {
    validateProfile(action.input)
    next.business = { ...action.input, id: data.business?.id ?? uuid(), owner_id: 'demo' }; return next
  }
  if (!next.business) throw new Error('Create your business profile first.')
  if (action.kind === 'product') {
    validateProduct(action.input)
    const { opening_stock, ...fields } = action.input
    if (action.id) {
      const p = next.products.find(p => p.id === action.id)
      if (!p) throw new Error('Product not found.')
      Object.assign(p, fields)
    } else {
      const id = uuid()
      next.products.push({ ...fields, id, business_id: next.business.id, stock: opening_stock, archived: false })
      next.movements.unshift({ id: uuid(), business_id: next.business.id, product_id: id, delta: opening_stock, reason: 'Opening stock', created_at: new Date().toISOString() })
    }
  } else if (action.kind === 'archive') {
    const p = next.products.find(p => p.id === action.id)
    if (!p) throw new Error('Product not found.'); p.archived = action.archived
  } else if (action.kind === 'adjust') {
    integer(action.delta, -1_000_000); textValue(action.reason, 'Reason', 300)
    if (!action.delta) throw new Error('Adjustment must change stock.')
    const previous = next.movements.find(m => m.id === action.key)
    if (previous) {
      if (previous.product_id !== action.id || previous.delta !== action.delta || previous.reason !== action.reason) throw new Error('This retry key belongs to a different adjustment.')
      return data
    }
    const p = next.products.find(p => p.id === action.id && !p.archived)
    if (!p) throw new Error('Active product not found.')
    integer(p.stock + action.delta); p.stock += action.delta
    next.movements.unshift({ id: action.key, business_id: next.business.id, product_id: p.id, delta: action.delta, reason: action.reason, created_at: new Date().toISOString() })
  } else {
    validateExpense(action.input)
    const existing = next.expenses.find(e => e.id === action.input.id)
    if (existing) {
      if (existing.amount_cents !== action.input.amount_cents || existing.expense_date !== action.input.expense_date || existing.category !== action.input.category || existing.note !== action.input.note) throw new Error('This retry key belongs to a different expense.')
      return data
    }
    next.expenses.unshift({ ...action.input, business_id: next.business.id, created_at: new Date().toISOString() })
  }
  return next
}
export function readDemo(): Workspace {
  const raw = localStorage.getItem(DEMO_STORAGE_KEY)
  if (!raw) { const data = sampleWorkspace(); localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data)); return data }
  try { const data = JSON.parse(raw) as Workspace; if (!Array.isArray(data.products) || !Array.isArray(data.sales) || !Array.isArray(data.expenses) || !Array.isArray(data.movements)) throw new Error(); return data }
  catch { throw new Error('The local demo could not be read. Use Reset demo on the welcome screen to restore the illustrative records.') }
}
export async function mutateDemo(action: Mutation): Promise<Workspace> {
  const run = () => { const next = demoMutation(readDemo(), action); localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next)); return next }
  if (navigator.locks) return navigator.locks.request('bizbridge-demo', run)
  throw new Error('Your browser does not support safe demo updates. Use a current browser on localhost or HTTPS.')
}
export const blankDemo = () => { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(emptyWorkspace())) }
