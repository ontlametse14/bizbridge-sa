// Explicit, one-user signup through the normal Auth API. Never auto-confirms.
import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'

async function run() {
  loadEnvFile('.env.test')
  const account = process.argv[2]
  if (!['A', 'B'].includes(account)) throw new Error('Choose test account A or B.')
  if (process.env.TEST_ALLOW_DISPOSABLE_BUSINESSES !== 'true') throw new Error('Disposable test-project opt-in is required.')
  const url = process.env.TEST_SUPABASE_URL, key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY
  const email = process.env[`TEST_USER_${account}_EMAIL`], password = process.env[`TEST_USER_${account}_PASSWORD`]
  if (!url?.startsWith('https://') || !key?.startsWith('sb_publishable_') || !email || !password) throw new Error('Public project configuration and the chosen test credentials are required.')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: 'http://127.0.0.1:5173/dashboard' } })
  if (error) {
    const code = /^[a-z_]+$/.test(error.code || '') ? error.code : 'unknown'
    throw new Error(`Signup was not completed (HTTP ${error.status || 'unavailable'}, code ${code}). No credentials or response body logged.`)
  }
  console.log(data.session ? 'Signup returned an authenticated session; review confirmation settings before proceeding.' : 'Signup request accepted. Check the inbox and confirm the email before running signed-in tests.')
  if (data.session) await client.auth.signOut({ scope: 'local' })
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
