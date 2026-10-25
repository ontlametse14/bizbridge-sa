import { useRef, useState, type FormEvent } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Field, FormActions, Notice } from './components'
import { businessToday, cents, expenseCategories, integer, money, paymentMethods, provinces, stages, textValue, validateExpense, validateProduct, validateProfile, validateSale, type Product, type ProfileInput } from './domain'
import { useWorkspace } from './store'
import type { Mutation } from './demo'
const formData = (e: FormEvent<HTMLFormElement>) => new FormData(e.currentTarget)
const string = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()

function useSave(kind: string, onSaved: () => void, persisted = false) {
  const { mutate, data, demo, session } = useWorkspace()
  const storageKey = `bizbridge.pending.${demo ? 'demo' : session?.user.id}.${data.business?.id}.${kind}`
  const [pending, setPending] = useState<Mutation | null>(() => { try { return persisted ? JSON.parse(sessionStorage.getItem(storageKey) || 'null') : null } catch { return null } })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const lock = useRef(false)
  function clear() { setPending(null); sessionStorage.removeItem(storageKey) }
  async function save(build: () => Mutation) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const action = pending ?? build()
      if (persisted) { sessionStorage.setItem(storageKey, JSON.stringify(action)); setPending(action) }
      await mutate(action); clear(); onSaved()
    } catch (e) {
      if (demo || (e && typeof e === 'object' && 'definitive' in e && e.definitive)) clear()
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.')
    } finally { lock.current = false; setBusy(false) }
  }
  return { save, busy, error, pending }
}
export function ProfileForm({ onSaved }: { onSaved: () => void }) {
  const { data } = useWorkspace(), b = data.business
  const { save, busy, error } = useSave('profile', onSaved)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = formData(e)
    void save(() => {
      const input: ProfileInput = { name: textValue(string(fd, 'name'), 'Business name'), category: textValue(string(fd, 'category'), 'Category', 80), town: string(fd, 'town'), province: string(fd, 'province'), stage: string(fd, 'stage'), records_reviewed: b?.records_reviewed ?? false, receipts_kept: b?.receipts_kept ?? false, documents_reviewed: b?.documents_reviewed ?? false }
      validateProfile(input); return { kind: 'profile', input }
    })
  }
  return <form onSubmit={submit} className="business-form">{error && <Notice kind="error">{error}</Notice>}<Field label="Business name"><input name="name" required maxLength={120} defaultValue={b?.name} placeholder="Your business name" /></Field><div className="form-grid"><Field label="Business category"><input name="category" required maxLength={80} defaultValue={b?.category} placeholder="e.g. Household products" /></Field><Field label="Operating stage"><select name="stage" defaultValue={b?.stage || ''} required><option value="" disabled>Select stage</option>{stages.map(s => <option key={s}>{s}</option>)}</select></Field><Field label="Town (optional)"><input name="town" maxLength={100} defaultValue={b?.town} /></Field><Field label="Province (optional)"><select name="province" defaultValue={b?.province || ''}><option value="">Not specified</option>{provinces.map(p => <option key={p}>{p}</option>)}</select></Field></div><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : b ? 'Save business profile' : 'Create business profile'}</button></form>
}
export function ProductForm({ product, onSaved, onCancel }: { product?: Product; onSaved: () => void; onCancel: () => void }) {
  const { save, busy, error } = useSave('product', onSaved)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = formData(e)
    void save(() => {
      const input = { name: textValue(string(fd, 'name'), 'Product name'), sku: string(fd, 'sku') || null, price_cents: cents(string(fd, 'price'))!, cost_cents: cents(string(fd, 'cost'), true), opening_stock: product ? 0 : integer(string(fd, 'stock')), low_stock_threshold: string(fd, 'threshold') === '' ? null : integer(string(fd, 'threshold')) }
      validateProduct(input); return { kind: 'product', id: product?.id, input }
    })
  }
  return <form onSubmit={submit}>{error && <Notice kind="error">{error}</Notice>}<Field label="Product name"><input name="name" required maxLength={120} defaultValue={product?.name} placeholder="e.g. All-purpose cleaner · 5L" /></Field><Field label="SKU (optional)"><input name="sku" maxLength={60} defaultValue={product?.sku || ''} placeholder="Your product code" /></Field><div className="form-grid"><Field label="Selling price (R)"><input name="price" inputMode="decimal" required defaultValue={product ? (product.price_cents / 100).toFixed(2) : ''} placeholder="120.00" /></Field><Field label="Unit cost (R, optional)" hint="Leave blank if unknown. Zero means the unit has no cost."><input name="cost" inputMode="decimal" defaultValue={product?.cost_cents == null ? '' : (product.cost_cents / 100).toFixed(2)} placeholder="70.00" /></Field>{!product && <Field label="Opening stock"><input name="stock" type="number" min="0" max="1000000" step="1" defaultValue="0" required /></Field>}<Field label="Low-stock threshold (optional)" hint="Warn when stock is at or below this number."><input name="threshold" type="number" min="0" max="1000000" step="1" defaultValue={product?.low_stock_threshold ?? ''} placeholder="5" /></Field></div><Notice>{product ? 'Price and cost changes apply to future sales. Historical sale snapshots stay unchanged. Use Adjust stock to change quantities.' : 'Use the cost of one sellable unit, including relevant inventory costs. Opening stock uses whole units.'}</Notice><FormActions busy={busy} onCancel={onCancel} label={product ? 'Save product' : 'Add product'} /></form>
}
export function SaleForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const { data } = useWorkspace(), products = data.products.filter(p => !p.archived)
  const { save, busy, error, pending } = useSave('sale', onSaved, true)
  const prior = pending?.kind === 'sale' ? pending.input : null
  const [productId, setProductId] = useState(prior?.product_id || products[0]?.id || '')
  const [quantity, setQuantity] = useState(String(prior?.quantity || 1))
  const product = products.find(p => p.id === productId), qty = /^\d+$/.test(quantity) ? Number(quantity) : 0
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = formData(e)
    void save(() => {
      const input = { product_id: productId, quantity: integer(quantity, 1), sale_date: string(fd, 'date'), payment_method: string(fd, 'method'), idempotency_key: crypto.randomUUID() }
      validateSale(input)
      if (!product || product.stock < input.quantity) throw Object.assign(new Error('Insufficient stock. No sale was saved.'), { definitive: true })
      return { kind: 'sale', input }
    })
  }
  return <form onSubmit={submit}>{error && <Notice kind="error">{error}</Notice>}{pending && <Notice kind="warning">A submitted sale is awaiting confirmation. Retry this same request safely; its saved key prevents duplicates. You can close this dialog and return to it.</Notice>}<fieldset disabled={busy || Boolean(pending)}><Field label="Product"><select name="product" value={productId} onChange={e => setProductId(e.target.value)} required>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.stock} available)</option>)}</select></Field><div className="form-grid"><Field label="Quantity"><input name="quantity" type="number" min="1" max="1000000" step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} /></Field><Field label="Sale date"><input name="date" type="date" min="2000-01-01" max={businessToday()} defaultValue={prior?.sale_date || businessToday()} required /></Field></div><Field label="Payment method" hint="A recordkeeping label only. No payment is processed."><select name="method" defaultValue={prior?.payment_method || 'Cash'}>{paymentMethods.map(m => <option key={m}>{m}</option>)}</select></Field></fieldset><div className="sale-summary"><div><span>Unit selling price</span><b>{product ? money(product.price_cents) : '—'}</b></div><div><span>Sale total</span><strong>{product && qty <= 1000000 ? money(product.price_cents * qty) : '—'}</strong></div></div>{product?.cost_cents === null && <Notice kind="warning"><AlertTriangle size={16} /> This product has no unit cost. The sale will make profit estimates incomplete. Add the cost to the product before selling if you know it.</Notice>}<FormActions busy={busy} onCancel={onCancel} label={pending ? 'Retry same sale' : 'Record completed sale'} /></form>
}
export function ExpenseForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const { save, busy, error, pending } = useSave('expense', onSaved, true), prior = pending?.kind === 'expense' ? pending.input : null
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = formData(e)
    void save(() => {
      const input = { id: crypto.randomUUID(), amount_cents: cents(string(fd, 'amount'))!, expense_date: string(fd, 'date'), category: string(fd, 'category'), note: string(fd, 'note') }
      validateExpense(input); return { kind: 'expense', input }
    })
  }
  return <form onSubmit={submit}><Notice>Record operating expenses here, such as transport or marketing. Inventory purchases belong in product unit costs and stock adjustments. Adding them here too would deduct stock costs twice. This is not a complete accounting or tax system.</Notice>{error && <Notice kind="error">{error}</Notice>}{pending && <Notice kind="warning">Confirmation is pending. Retry the same saved request to avoid a duplicate expense.</Notice>}<fieldset disabled={busy || Boolean(pending)}><div className="form-grid"><Field label="Amount (R)"><input name="amount" inputMode="decimal" required placeholder="30.00" defaultValue={prior ? (prior.amount_cents / 100).toFixed(2) : ''} /></Field><Field label="Expense date"><input name="date" type="date" min="2000-01-01" max={businessToday()} defaultValue={prior?.expense_date || businessToday()} required /></Field></div><Field label="Category"><select name="category" defaultValue={prior?.category || 'Transport'}>{expenseCategories.map(c => <option key={c}>{c}</option>)}</select></Field><Field label="Note (optional)"><textarea name="note" maxLength={500} rows={3} defaultValue={prior?.note} placeholder="What was this expense for?" /></Field></fieldset><FormActions busy={busy} onCancel={onCancel} label={pending ? 'Retry same expense' : 'Record expense'} /></form>
}
export function StockForm({ product, onSaved, onCancel }: { product: Product; onSaved: () => void; onCancel: () => void }) {
  const { save, busy, error, pending } = useSave(`stock.${product.id}`, onSaved, true), prior = pending?.kind === 'adjust' ? pending : null
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = formData(e)
    void save(() => {
      const delta = integer(string(fd, 'delta'), -1000000)
      if (!delta) throw Object.assign(new Error('Enter a non-zero stock adjustment.'), { definitive: true })
      integer(product.stock + delta)
      return { kind: 'adjust', id: product.id, delta, reason: textValue(string(fd, 'reason'), 'Reason', 300), key: crypto.randomUUID() }
    })
  }
  return <form onSubmit={submit}><p className="form-intro"><strong>{product.name}</strong> · {product.stock} units currently in stock.</p>{error && <Notice kind="error">{error}</Notice>}{pending && <Notice kind="warning">Retry this saved adjustment to confirm its outcome.</Notice>}<fieldset disabled={busy || Boolean(pending)}><Field label="Stock change" hint="Use a positive number for stock received, or a negative number for damage or loss."><input name="delta" type="number" step="1" min="-1000000" max="1000000" required defaultValue={prior?.delta} placeholder="e.g. 10 or -2" /></Field><Field label="Reason"><textarea name="reason" required maxLength={300} rows={3} defaultValue={prior?.reason} placeholder="e.g. Received 10 new units from supplier" /></Field></fieldset><FormActions busy={busy} onCancel={onCancel} label={pending ? 'Retry adjustment' : 'Save stock adjustment'} /></form>
}
