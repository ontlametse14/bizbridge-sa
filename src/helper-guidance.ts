import { businessReport, displayDate, incompleteProfitMessage, lowStock, money, periodLabels, readiness, type Workspace } from './domain'

export type HelperIntent = 'product' | 'sale' | 'expense' | 'summary' | 'stock' | 'readiness' | 'gross'
export type HelperAction = { label: string; path: string }
export type HelperReply = { title?: string; paragraphs: string[]; actions?: HelperAction[]; choices?: HelperIntent[]; rows?: { label: string; value: string }[]; warning?: string; source?: string }
export type HelperContext = {
  mode: 'anonymous' | 'real' | 'demo'; userId: string | null; data: Workspace | null;
  loading: boolean; error: string; retrievedAt: string | null; period: string
}
export const welcomeMessage = 'Hi! I’m BizBridge Helper. I can explain how to use the app, show your recorded business summary and highlight products that need attention. Choose a question below.'
export const helperExplanation = 'I use prepared guidance and your recorded business information. I’m a guided assistant, not a generative-AI chatbot.'
export const unsupportedMessage = 'I can help with products, sales, expenses, business summaries, stock and your Growth Guide. Please choose a topic below.'
export const topics: { id: HelperIntent; question: string }[] = [
  { id: 'product', question: 'How do I add a product?' }, { id: 'sale', question: 'How do I record a sale?' },
  { id: 'expense', question: 'How do I record an expense?' }, { id: 'summary', question: 'Show my business summary.' },
  { id: 'stock', question: 'Which products need restocking?' }, { id: 'readiness', question: 'Explain my readiness score.' },
  { id: 'gross', question: 'What does gross profit mean?' },
]
const allTopics = topics.map(t => t.id)
const guidance: Partial<Record<HelperIntent, HelperReply>> = {
  product: { paragraphs: ['Open Products, choose Add product, then enter Product name, Selling price (R) and a whole-number Opening stock. SKU, Unit cost and Low-stock threshold are optional.', 'Leave unit cost blank if unknown; R0 means a known zero cost. The threshold warns when stock is at or below that number. Choose Add product in the form to save.'], actions: [{ label: 'Open Products', path: '/products' }] },
  sale: { paragraphs: ['Open Sales and choose Record sale. Select an active product, a whole-number Quantity, Sale date and Payment method. Review the total, then choose Record completed sale in the form.', 'Add a product first if none exists. Stock must be sufficient. A completed sale and its stock reduction are saved together; the selling price and cost are saved as historical snapshots. Payment method is a label only—no payment is processed. I cannot submit a sale.'], actions: [{ label: 'Open Sales', path: '/sales' }] },
  expense: { paragraphs: ['Open Expenses and choose Add expense. Enter Amount (R), Expense date and Category; Note is optional. Choose Record expense in the form to save.', 'Use this for operating costs such as transport, marketing, utilities or rent. Keep inventory purchases in product unit costs and stock adjustments. Recording them as operating expenses too would deduct stock costs twice. This is not a complete accounting or tax system.'], actions: [{ label: 'Open Expenses', path: '/expenses' }] },
  gross: { paragraphs: ['Gross profit = recorded sales revenue − cost of goods sold. Cost of goods sold uses the quantity sold × the unit cost saved with each sale.', 'Illustrative example only: selling 2 units at R120 each gives R240 revenue. At a recorded cost of R70 each, cost of goods sold is R140 and gross profit is R100. These are example figures, not a claim about your business.', 'Estimated operating profit then subtracts recorded operating expenses. If a sale’s cost is missing, profit is incomplete; missing costs are never assumed to be zero. Estimates exclude tax and unrecorded costs.'], actions: [{ label: 'Open Dashboard', path: '/dashboard' }] },
}
// Specific phrases are considered together before broad topic keywords.
// Add synonyms here, keeping ambiguous multi-topic questions as choices.
const intents: { id: HelperIntent; phrases: RegExp; keyword: RegExp }[] = [
  { id: 'product', phrases: /\b(?:add|create|new) (?:a |an |new )?(?:product|item)\b/, keyword: /\b(?:product|products|item|items)\b/ },
  { id: 'sale', phrases: /\b(?:record|log|add) (?:a |new )?sale\b/, keyword: /\b(?:sales?|sell)\b/ },
  { id: 'expense', phrases: /\b(?:record|log|add) (?:an? |new )?expense\b/, keyword: /\b(?:expenses?|spending)\b/ },
  { id: 'summary', phrases: /\b(?:business summary|my summary|summary|my numbers|revenue|operating profit|cost of goods sold)\b/, keyword: /\b(?:summary|numbers|revenue)\b/ },
  { id: 'stock', phrases: /\b(?:low stock|restock(?:ing)?|stock levels?|need restocking)\b/, keyword: /\bstock\b/ },
  { id: 'readiness', phrases: /\b(?:readiness|growth guide|checklist score)\b/, keyword: /\b(?:score|checklist|growth)\b/ },
  { id: 'gross', phrases: /\b(?:(?:what|explain|meaning|define)\b.*\bgross profit|gross profit (?:mean|means|meaning))\b|^gross profit$/, keyword: /\bgross profit\b/ },
]
export type QuestionMatch = { kind: 'answer'; intent: HelperIntent } | { kind: 'ambiguous'; choices: HelperIntent[] } | { kind: 'unsupported' } | { kind: 'read-only'; choices: HelperIntent[] }
export function matchQuestion(question: string): QuestionMatch {
  const q = question.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!q) return { kind: 'unsupported' }
  const specific = intents.filter(i => i.phrases.test(q)).map(i => i.id)
  const matches = specific.length ? specific : intents.filter(i => i.keyword.test(q)).map(i => i.id)
  const change = /\b(?:delete|remove|edit|update|change|archive|adjust|submit|save|buy|sell)\b/.test(q) || (/\b(?:add|record|log|create)\b/.test(q) && /\d|\b(?:for me|now|please do)\b/.test(q))
  if (change) return { kind: 'read-only', choices: matches.filter(i => ['product', 'sale', 'expense', 'stock'].includes(i)) }
  if (matches.length > 1) return { kind: 'ambiguous', choices: matches }
  return matches.length ? { kind: 'answer', intent: matches[0] } : { kind: 'unsupported' }
}
export function helperScope(context: HelperContext) {
  return JSON.stringify([context.mode, context.userId, context.data?.business?.id ?? null])
}
function unavailable(intent: HelperIntent): HelperReply {
  return { paragraphs: [intent === 'stock' ? 'Unable to load stock information. No stock figures are available.' : 'Unable to load your business information. No figures or readiness score are available.', 'Close the helper and use the app’s loading or retry controls. A failed request is never treated as zero records.'] }
}
export function answerIntent(intent: HelperIntent, context: HelperContext): HelperReply {
  if (guidance[intent]) return guidance[intent]
  if (context.mode === 'anonymous' || (context.mode === 'real' && !context.userId)) return { paragraphs: ['Sign in to view your recorded business information. Generic app guidance is available without signing in. The explicit demo uses separate fictional records.'] }
  if (context.loading) return { paragraphs: ['Your business records are still loading. This answer will update when the app finishes loading.'] }
  if (context.error || !context.data || !context.retrievedAt) return unavailable(intent)
  const data = context.data
  if (context.mode === 'real' && data.business && data.business.owner_id !== context.userId) return unavailable(intent)
  if (!data.business) return { paragraphs: ['Create your business profile first. There is no saved business summary or readiness score yet.'], actions: [{ label: 'Open business setup', path: '/settings' }] }
  const source = `${context.mode === 'demo' ? 'DEMO MODE — fictional data stored on this device. ' : 'Your authorised business records. '}Retrieved ${new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Africa/Johannesburg' }).format(new Date(context.retrievedAt))} · Africa/Johannesburg.`
  try {
    if (intent === 'summary') {
      const report = businessReport(data, context.period), m = report.totals
      return { title: data.business.name, source, paragraphs: [`Reporting period: ${periodLabels[context.period] || 'Last 30 days'} · ${displayDate(report.start)} to ${displayDate(report.end)}. This follows the Dashboard reporting-period selector.`, ...(report.sales.length || report.expenses.length ? [] : ['No sales or operating expenses recorded in this period.']), 'Estimates exclude tax and unrecorded costs.'], rows: [
        { label: 'Sales revenue', value: money(m.revenue) }, { label: 'Cost of goods sold', value: m.cogs === null ? 'Incomplete' : money(m.cogs) },
        { label: 'Gross profit', value: m.grossProfit === null ? 'Incomplete' : money(m.grossProfit) }, { label: 'Operating expenses', value: money(m.operatingExpenses) },
        { label: 'Estimated operating profit', value: m.operatingProfit === null ? 'Incomplete' : money(m.operatingProfit) },
      ], warning: incompleteProfitMessage(m), actions: [{ label: 'Open Dashboard', path: '/dashboard' }] }
    }
    if (intent === 'stock') {
      const products = data.products.filter(p => !p.archived), low = lowStock(data.products)
      return { source, paragraphs: [!data.products.length ? 'No products yet. Add your first product to begin tracking stock.' : !products.length ? 'No active products. All saved products are archived.' : low.length ? 'These active products are at or below their low-stock threshold. Current stock is shown across all dates; this is not a stock forecast.' : 'No low-stock products among active products with a threshold.', ...(products.some(p => p.low_stock_threshold === null) ? ['Some active products have no threshold. Set one in Products so they can be included in low-stock checks.'] : [])], rows: low.map(p => ({ label: p.name, value: `${p.stock} units · threshold ${p.low_stock_threshold}` })), actions: [{ label: 'Review Products', path: low.length ? '/products?filter=low' : '/products' }] }
    }
    const result = readiness(data), products = data.products.filter(p => !p.archived)
    const missing = products.filter(p => p.cost_cents === null), low = lowStock(products)
    return { source, title: result.score === null ? 'Readiness: not started' : `Readiness: ${result.score}/100`, paragraphs: [
      ...(result.score === null ? ['Add your first active product before an overall score can be shown.'] : []),
      ...result.indicators.map(i => `${i.name}: ${i.earned}/${i.max}. ${i.detail}`),
      'Each contribution is coverage × maximum points, rounded. Revenue does not affect the score. These recordkeeping habits are self-declared; document requirements vary by organisation and opportunity.',
      'This is a business-management checklist, not a credit score, compliance certification or guarantee of funding. It is not a credit rating or funding approval.',
    ], actions: [
      ...(!products.length ? [{ label: 'Add your first product', path: '/products' }] : []),
      ...(missing.length ? [{ label: 'Add missing product costs', path: '/products?filter=cost' }] : []),
      ...(low.length ? [{ label: 'Review low stock', path: '/products?filter=low' }] : []),
      { label: result.indicators[0].earned < 20 ? 'Complete your business profile' : 'Review your profile', path: '/settings' },
      { label: 'Open Growth Guide', path: '/growth' },
    ] }
  } catch { return unavailable(intent) }
}
export function answerQuestion(question: string, context: HelperContext): HelperReply {
  const match = matchQuestion(question)
  if (match.kind === 'answer') return answerIntent(match.intent, context)
  if (match.kind === 'ambiguous') return { paragraphs: ['That matches more than one supported topic. Please choose which one you mean.'], choices: match.choices }
  if (match.kind === 'read-only') return { paragraphs: ['I’m read-only. I cannot add, edit or delete records. Use the appropriate app screen and review its form before saving.'], actions: [{ label: 'Open Products', path: '/products' }, { label: 'Open Sales', path: '/sales' }, { label: 'Open Expenses', path: '/expenses' }], choices: match.choices }
  return { paragraphs: [unsupportedMessage], choices: allTopics }
}
