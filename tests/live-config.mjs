import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
export function liveConfig() {
  if (existsSync('.env.test')) loadEnvFile('.env.test')
  const names = ['TEST_SUPABASE_URL', 'TEST_SUPABASE_PUBLISHABLE_KEY', 'TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_USER_B_EMAIL', 'TEST_USER_B_PASSWORD']
  const missing = names.filter(name => !process.env[name]?.trim())
  if (missing.length) throw new Error(`Live tests not run. Fill these fields in .env.test: ${missing.join(', ')}.`)
  if (process.env.TEST_ALLOW_DISPOSABLE_BUSINESSES !== 'true') throw new Error('Live tests not run. Set TEST_ALLOW_DISPOSABLE_BUSINESSES=true only for the selected disposable project.')
  let url
  try { url = new URL(process.env.TEST_SUPABASE_URL) } catch { throw new Error('TEST_SUPABASE_URL must be a valid project URL.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Use the HTTPS Supabase project origin without credentials, path, query or fragment.')
  const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY.trim()
  let isAnon = false
  try { isAnon = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon' } catch { /* Publishable keys are not JWTs. */ }
  if (!key.startsWith('sb_publishable_') && !isAnon) throw new Error('Use a publishable key or legacy anon key. Privileged keys are not allowed in these tests.')
  if (process.env.TEST_USER_A_EMAIL.toLowerCase() === process.env.TEST_USER_B_EMAIL.toLowerCase()) throw new Error('Use two different test accounts.')
  return { url: url.origin, key, emailA: process.env.TEST_USER_A_EMAIL, passwordA: process.env.TEST_USER_A_PASSWORD, emailB: process.env.TEST_USER_B_EMAIL, passwordB: process.env.TEST_USER_B_PASSWORD }
}
