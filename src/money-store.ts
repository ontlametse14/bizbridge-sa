import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './backend'
import { demoMoneyKey, mutateDemoMoney, readDemoMoney } from './demo'
import { moneyTotals, validateMoneyAction, type MoneyPlan, type MoneyRequest } from './money-plan'

function checkPlan(plan: MoneyPlan | null, businessId: string): MoneyPlan {
  if (!plan || plan.business_id !== businessId || !Number.isInteger(plan.revision) || !Array.isArray(plan.snapshots) || !Array.isArray(plan.allocations) || !Array.isArray(plan.withdrawals) || !Array.isArray(plan.events)) throw new Error('Money Split returned incomplete data. Please reload; no balance is available.')
  for (const list of [plan.snapshots, plan.allocations, plan.withdrawals, plan.events]) if (list.some(row => row.business_id !== businessId)) throw new Error('Money Split returned an unexpected business. Please sign in again.')
  moneyTotals(plan)
  return plan
}
export function useMoneyPlan(businessId: string, demo: boolean, userId: string) {
  const [plan, setPlan] = useState<MoneyPlan | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const storageKey = `bizbridge.pending.${demo ? 'demo' : userId}.${businessId}.money`
  const [pending, setPending] = useState<MoneyRequest | null>(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch { return null } })
  const active = useRef(true), epoch = useRef(0), saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => {
    const version = ++epoch.current
    setLoading(true); setError('')
    try {
      let result: MoneyPlan
      if (demo) result = readDemoMoney(businessId)
      else {
        if (!supabase) throw new Error('Supabase is not configured.')
        const response = await supabase.rpc('get_money_plan', { p_business_id: businessId })
        if (response.error) throw new Error(response.error.code === 'PGRST202' ? 'Money Split needs its database migration. Your existing business records are unchanged.' : response.error.message)
        result = response.data as MoneyPlan
      }
      result = checkPlan(result, businessId)
      if (active.current && version === epoch.current) setPlan(result)
    } catch (e) {
      if (active.current && version === epoch.current) { setPlan(null); setError(e instanceof Error ? e.message : 'Unable to load Money Split.') }
    } finally { if (active.current && version === epoch.current) setLoading(false) }
  }, [businessId, demo])
  useEffect(() => {
    active.current = true
    const version = epoch
    const timer = window.setTimeout(() => { void reload() }, 0)
    const sync = (event: StorageEvent) => { if (demo && event.key === demoMoneyKey(businessId)) void reload() }
    window.addEventListener('storage', sync)
    return () => { active.current = false; ++version.current; window.clearTimeout(timer); window.removeEventListener('storage', sync) }
  }, [businessId, demo, reload])
  async function save(request: MoneyRequest) {
    if (saving.current) return false
    saving.current = true; setBusy(true)
    try {
      validateMoneyAction(request)
      // Persist before the request, including its immutable expected revision.
      sessionStorage.setItem(storageKey, JSON.stringify(request)); setPending(request)
      if (demo) await mutateDemoMoney(businessId, request)
      else {
        if (!supabase) throw new Error('Supabase is not configured.')
        const { error: failure } = await supabase.rpc('change_money_plan', { p_business_id: businessId, p_request_id: request.key, p_expected_revision: request.expectedRevision, p_kind: request.kind, p_payload: request.input })
        if (failure) throw Object.assign(new Error(failure.message), { definitive: /^(22|23|42|PGRST)/.test(failure.code) || failure.code === 'PT409', conflict: failure.code === 'PT409' })
      }
      if (!active.current) return false
      sessionStorage.removeItem(storageKey); setPending(null)
      await reload()
      return true
    } catch (e) {
      if (!active.current) return false
      if (demo || (e && typeof e === 'object' && 'definitive' in e && e.definitive)) { sessionStorage.removeItem(storageKey); setPending(null) }
      if (e && typeof e === 'object' && 'conflict' in e && e.conflict) await reload()
      throw e
    } finally { saving.current = false; if (active.current) setBusy(false) }
  }
  return { plan, loading, error, reload, save, pending, busy }
}
