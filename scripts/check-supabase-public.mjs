// Read-only checks that need public project configuration, not test passwords.
import { loadEnvFile } from 'node:process'
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

async function run() {
  if (existsSync('.env.local')) loadEnvFile('.env.local')
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key?.startsWith('sb_publishable_')) throw new Error('Public Supabase configuration is missing or invalid.')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  let passed = 0
  async function denied(name, request) {
    const response = await request
    if (response.error?.code !== '42501') throw new Error(`Expected database permission denial for ${name}; network errors do not count.`)
    passed++; console.log(`PASS anonymous access denied: ${name}`)
  }
  for (const table of ['businesses', 'products', 'sales', 'expenses', 'stock_movements']) await denied(table, client.from(table).select('id').limit(1))
  const id = crypto.randomUUID()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const calls = [
    ['get_workspace', {}],
    ['save_product', { p_business_id: id, p_product_id: null, p_name: 'Anonymous access probe', p_sku: null, p_price_cents: 12000, p_cost_cents: 7000, p_opening_stock: 20, p_threshold: 5 }],
    ['archive_product', { p_business_id: id, p_product_id: id, p_archived: true }],
    ['record_sale', { p_business_id: id, p_product_id: id, p_quantity: 1, p_sale_date: today, p_payment_method: 'Cash', p_idempotency_key: id }],
    ['adjust_stock', { p_business_id: id, p_product_id: id, p_delta: 1, p_reason: 'Anonymous access probe', p_idempotency_key: id }],
    ['record_expense', { p_business_id: id, p_id: id, p_amount_cents: 3000, p_expense_date: today, p_category: 'Transport', p_note: '' }],
  ]
  for (const [name, args] of calls) await denied(name, client.rpc(name, args))
  const settingsResponse = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
  if (!settingsResponse.ok) throw new Error('Auth settings endpoint could not be verified.')
  const settings = await settingsResponse.json()
  if (!settings.external?.email || settings.mailer_autoconfirm !== false) throw new Error('Expected email authentication enabled and email confirmation required.')
  passed++; console.log('PASS hosted email authentication enabled and confirmation required')
  console.log(`${passed} hosted public-boundary checks passed. Signed-in isolation, concurrency and email delivery still require separate tests.`)
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
