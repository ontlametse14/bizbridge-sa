export type Page = 'dashboard' | 'products' | 'sales' | 'expenses' | 'money' | 'growth' | 'settings'
export type Business = {
  id: string; owner_id: string; name: string; category: string; town: string; province: string;
  stage: string; records_reviewed: boolean; receipts_kept: boolean; documents_reviewed: boolean
}
export type Product = {
  id: string; business_id: string; name: string; sku: string | null; price_cents: number;
  cost_cents: number | null; stock: number; low_stock_threshold: number | null; archived: boolean
}
export type Sale = {
  id: string; business_id: string; product_id: string; product_name: string; quantity: number;
  unit_price_cents: number; unit_cost_cents: number | null; total_cents: number;
  sale_date: string; payment_method: string; idempotency_key: string; created_at: string
}
export type Expense = { id: string; business_id: string; amount_cents: number; expense_date: string; category: string; note: string; created_at: string }
export type StockMovement = { id: string; business_id: string; product_id: string; delta: number; reason: string; created_at: string }
export type Workspace = { business: Business | null; products: Product[]; sales: Sale[]; expenses: Expense[]; movements: StockMovement[] }
export type ProductInput = Pick<Product, 'name' | 'sku' | 'price_cents' | 'cost_cents' | 'low_stock_threshold'> & { opening_stock: number }
export type SaleInput = { product_id: string; quantity: number; sale_date: string; payment_method: string; idempotency_key: string }
export type ExpenseInput = Pick<Expense, 'id' | 'amount_cents' | 'expense_date' | 'category' | 'note'>
export type ProfileInput = Omit<Business, 'id' | 'owner_id'>
export const emptyWorkspace = (): Workspace => ({ business: null, products: [], sales: [], expenses: [], movements: [] })
export const expenseCategories = ['Transport', 'Marketing', 'Utilities', 'Rent', 'Packaging', 'Other'] as const
export const paymentMethods = ['Cash', 'EFT', 'Card', 'Mobile payment', 'Other'] as const
export const stages = ['Planning', 'Just started', 'Trading regularly', 'Growing'] as const
export const provinces = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'] as const
export const money = (cents: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(cents / 100)
export function businessToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function displayDate(date: string) {
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date(`${date}T12:00:00+02:00`))
}
export function cents(value: string, optional = false): number | null {
  const v = value.trim()
  if (optional && !v) return null
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new Error('Enter a valid rand amount with at most two decimal places.')
  const [whole, fraction = ''] = v.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(result) || result > 100_000_000) throw new Error('Amount must be R1,000,000 or less.')
  return result
}
export function integer(value: string | number, min = 0, max = 1_000_000): number {
  if (typeof value === 'string' && !/^-?\d+$/.test(value.trim())) throw new Error('Use a whole-number quantity.')
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Quantity must be between ${min} and ${max}.`)
  return n
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value || value < '2000-01-01' || value > businessToday()) throw new Error('Choose a valid date between 2000 and today (Johannesburg time).')
  return value
}
export function textValue(value: string, label: string, max = 120) {
  const v = value.trim()
  if (!v || v.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer.`)
  return v
}
export function validateProduct(p: ProductInput) {
  textValue(p.name, 'Product name'); integer(p.price_cents, 1, 100_000_000)
  if (p.cost_cents !== null) integer(p.cost_cents, 0, 100_000_000)
  integer(p.opening_stock)
  if (p.low_stock_threshold !== null) integer(p.low_stock_threshold)
  if ((p.sku?.length ?? 0) > 60) throw new Error('SKU must be 60 characters or fewer.')
}
export function validateSale(s: SaleInput) {
  integer(s.quantity, 1); validDate(s.sale_date)
  if (!(paymentMethods as readonly string[]).includes(s.payment_method)) throw new Error('Choose a payment method.')
  if (!s.product_id || !s.idempotency_key) throw new Error('Product and transaction key are required.')
}
export function validateExpense(e: ExpenseInput) {
  integer(e.amount_cents, 1, 100_000_000); validDate(e.expense_date)
  if (!(expenseCategories as readonly string[]).includes(e.category)) throw new Error('Choose an operating expense category.')
  if (e.note.length > 500) throw new Error('Note must be 500 characters or fewer.')
}
export function validateProfile(p: ProfileInput) {
  textValue(p.name, 'Business name'); textValue(p.category, 'Category', 80)
  if (!(stages as readonly string[]).includes(p.stage)) throw new Error('Choose your operating stage.')
  if (p.town.length > 100 || (p.province && !(provinces as readonly string[]).includes(p.province))) throw new Error('Check your town and province.')
}
function safeSum(values: number[]) {
  const total = values.reduce((a, b) => a + BigInt(b), 0n)
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('This reporting total exceeds the supported money range. Select a shorter period.')
  return Number(total)
}
export function metrics(sales: Sale[], expenses: Expense[]) {
  const revenue = safeSum(sales.map(s => s.total_cents))
  const missingCosts = sales.filter(s => s.unit_cost_cents === null)
  const knownCogs = safeSum(sales.filter(s => s.unit_cost_cents !== null).map(s => s.quantity * s.unit_cost_cents!))
  const operatingExpenses = safeSum(expenses.map(e => e.amount_cents))
  const complete = missingCosts.length === 0
  const grossProfit = complete ? revenue - knownCogs : null
  return { revenue, knownCogs, cogs: complete ? knownCogs : null, grossProfit, operatingExpenses, operatingProfit: grossProfit === null ? null : safeSum([grossProfit, -operatingExpenses]), missingCosts }
}
export function periodStart(period: string, today = businessToday()) {
  if (period === 'all') return '2000-01-01'
  if (period === 'today') return today
  if (period === 'month') return `${today.slice(0, 7)}-01`
  if (period === 'year') return `${today.slice(0, 4)}-01-01`
  const day = new Date(`${today}T12:00:00Z`); day.setUTCDate(day.getUTCDate() - 29)
  return day.toISOString().slice(0, 10)
}
export const lowStock = (products: Product[]) => products.filter(p => !p.archived && p.low_stock_threshold !== null && p.stock <= p.low_stock_threshold)
export const periodLabels: Record<string, string> = { month: 'This month', '30': 'Last 30 days', today: 'Today', year: 'This year', all: 'All time' }
export function businessReport(data: Workspace, period: string, today = businessToday()) {
  const start = periodStart(period, today)
  const sales = data.sales.filter(s => s.sale_date >= start && s.sale_date <= today)
  const expenses = data.expenses.filter(e => e.expense_date >= start && e.expense_date <= today)
  return { start, end: today, sales, expenses, totals: metrics(sales, expenses) }
}
export function incompleteProfitMessage(m: ReturnType<typeof metrics>) {
  return m.missingCosts.length ? `Profit is incomplete. ${m.missingCosts.length} ${m.missingCosts.length === 1 ? 'sale has' : 'sales have'} no recorded cost: ${[...new Set(m.missingCosts.map(s => s.product_name))].join(', ')}. Known cost of goods sold: ${money(m.knownCogs)}. Missing costs are not counted as zero. Product edits improve future sales; these historical snapshots remain unknown.` : ''
}
export function readiness(data: Workspace) {
  const { business: b } = data
  const products = data.products.filter(p => !p.archived)
  const profile = b ? [b.name, b.category, b.stage].filter(Boolean).length / 3 : 0
  const costCoverage = products.length ? products.filter(p => p.cost_cents !== null).length / products.length : 0
  const thresholds = products.length ? products.filter(p => p.low_stock_threshold !== null).length / products.length : 0
  const checklist = b ? [b.records_reviewed, b.receipts_kept, b.documents_reviewed].filter(Boolean).length / 3 : 0
  const indicators = [
    { name: 'Business foundations', earned: Math.round(profile * 20), max: 20, detail: 'Business name, category and stage make your records easier to organise. Location is optional.', page: 'settings' as Page },
    { name: 'Know your product costs', earned: Math.round(costCoverage * 35), max: 35, detail: `${products.filter(p => p.cost_cents !== null).length} of ${products.length} active products have a unit cost. Costs make future profit estimates meaningful.`, page: 'products' as Page },
    { name: 'Stock management', earned: Math.round(thresholds * 20), max: 20, detail: `${products.filter(p => p.low_stock_threshold !== null).length} of ${products.length} active products have a low-stock threshold. A threshold helps you plan restocking.`, page: 'products' as Page },
    { name: 'Your recordkeeping habits', earned: Math.round(checklist * 25), max: 25, detail: 'Three self-declared habits: reviewing records, keeping receipts and considering documents relevant to your plans.', page: 'growth' as Page },
  ]
  return { score: b && products.length > 0 ? indicators.reduce((n, i) => n + i.earned, 0) : null, indicators }
}
