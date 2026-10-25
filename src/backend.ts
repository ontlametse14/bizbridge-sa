import { createClient } from '@supabase/supabase-js'
import type { Workspace } from './domain'
import type { Mutation } from './demo'
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const supplied = Boolean(url && key && !url.includes('YOUR_PROJECT') && !key.includes('REPLACE_ME'))
function initializeClient() {
  if (!supplied) return null
  try { return createClient(url!, key!, { auth: { storageKey: 'bizbridge.auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) }
  catch { return null }
}
export const supabase = initializeClient()
export const configured = Boolean(supabase)
export const partialConfig = Boolean(url || key) && !configured
export async function loadWorkspace(): Promise<Workspace> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('get_workspace')
  if (error) throw new Error(error.message)
  return data as Workspace
}
export async function mutateBackend(businessId: string | undefined, action: Mutation) {
  if (!supabase) throw new Error('Supabase is not configured.')
  let result
  if (action.kind === 'profile') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Please sign in again.')
    result = businessId
      ? await supabase.from('businesses').update(action.input).eq('id', businessId).select('id').single()
      : await supabase.from('businesses').insert({ ...action.input, owner_id: user.id }).select('id').single()
  } else if (action.kind === 'product') {
    result = await supabase.rpc('save_product', { p_business_id: businessId, p_product_id: action.id ?? null, p_name: action.input.name, p_sku: action.input.sku, p_price_cents: action.input.price_cents, p_cost_cents: action.input.cost_cents, p_opening_stock: action.input.opening_stock, p_threshold: action.input.low_stock_threshold })
  } else if (action.kind === 'sale') {
    result = await supabase.rpc('record_sale', { p_business_id: businessId, p_product_id: action.input.product_id, p_quantity: action.input.quantity, p_sale_date: action.input.sale_date, p_payment_method: action.input.payment_method, p_idempotency_key: action.input.idempotency_key })
  } else if (action.kind === 'expense') {
    result = await supabase.rpc('record_expense', { p_business_id: businessId, p_id: action.input.id, p_amount_cents: action.input.amount_cents, p_expense_date: action.input.expense_date, p_category: action.input.category, p_note: action.input.note })
  } else if (action.kind === 'archive') {
    result = await supabase.rpc('archive_product', { p_business_id: businessId, p_product_id: action.id, p_archived: action.archived })
  } else {
    result = await supabase.rpc('adjust_stock', { p_business_id: businessId, p_product_id: action.id, p_delta: action.delta, p_reason: action.reason, p_idempotency_key: action.key })
  }
  if (result.error) throw Object.assign(new Error(result.error.message), { definitive: /^[0-9A-Z]{5}$/.test(result.error.code ?? '') })
}
