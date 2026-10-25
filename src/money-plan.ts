import { integer, textValue, validDate } from './domain'

export const allocationCategories = ['Replacement stock', 'Upcoming bills', 'Transport', 'Emergency buffer', 'Other'] as const
export type AllocationCategory = typeof allocationCategories[number]
export type Allocation = { id: string; business_id: string; name: string; category: AllocationCategory; amount_cents: number; due_date: string | null; note: string; status: 'active' | 'cancelled' | 'settled' }
export type CashSnapshot = { id: string; business_id: string; revision: number; cash_cents: number; confirmed_at: string; source: string; note: string }
export type Withdrawal = { id: string; business_id: string; amount_cents: number; withdrawal_date: string; note: string; corrects_id: string | null; correction_reason: string; created_at: string }
export type MoneyEvent = { id: string; business_id: string; revision: number; kind: MoneyAction['kind']; payload: MoneyAction['input']; previous_allocation: Allocation | null; created_at: string }
export type MoneyPlan = { business_id: string; revision: number; snapshots: CashSnapshot[]; allocations: Allocation[]; withdrawals: Withdrawal[]; events: MoneyEvent[] }
export type MoneyAction =
  | { kind: 'confirm'; input: { cash_cents: number; note: string } }
  | { kind: 'allocation'; input: { allocation_id: string | null; name: string; category: AllocationCategory; amount_cents: number; due_date: string | null; note: string } }
  | { kind: 'cancel'; input: { allocation_id: string; note: string } }
  | { kind: 'settle'; input: { allocation_id: string; cash_cents: number; note: string; confirmed: boolean } }
  | { kind: 'withdrawal' | 'correct_withdrawal'; input: { amount_cents: number; withdrawal_date: string; note: string; cash_cents: number; confirmed: boolean; corrects_id: string | null; correction_reason: string } }
export type MoneyRequest = MoneyAction & { key: string; expectedRevision: number }
export const emptyMoneyPlan = (businessId: string): MoneyPlan => ({ business_id: businessId, revision: 0, snapshots: [], allocations: [], withdrawals: [], events: [] })
export function confirmationTime(value: string) {
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Africa/Johannesburg' }).format(new Date(value))
}
export function moneyTotals(plan: MoneyPlan) {
  const active = plan.allocations.filter(a => a.status === 'active')
  const sum = active.reduce((total, a) => total + BigInt(a.amount_cents), 0n)
  if (sum > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('The allocation total exceeds the supported range.')
  const allocated = Number(sum), snapshot = plan.snapshots.reduce<CashSnapshot | null>((last, s) => !last || s.revision > last.revision ? s : last, null)
  const cash = snapshot?.cash_cents ?? null
  return { active, snapshot, allocated, cash, unallocated: cash === null ? null : cash - allocated }
}
export function withdrawalPreview(plan: MoneyPlan, amount: number) {
  integer(amount, 1, 100_000_000)
  const { unallocated } = moneyTotals(plan)
  if (unallocated === null) throw new Error('Confirm your current business cash before checking a withdrawal.')
  const after = BigInt(unallocated) - BigInt(amount)
  if (after < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('This plan exceeds the supported money range.')
  return { before: unallocated, after: Number(after), shortfall: after < 0n ? Number(-after) : 0 }
}
export function validateMoneyAction(action: MoneyAction) {
  const p = action.input
  if (typeof p.note !== 'string' || p.note.length > 500) throw new Error('Note must be 500 characters or fewer.')
  if ('cash_cents' in p) integer(p.cash_cents, 0, 100_000_000)
  if ('confirmed' in p && p.confirmed !== true) throw new Error('Confirm that this cash balance already reflects the completed payment or withdrawal.')
  if ('allocation_id' in p && action.kind !== 'allocation' && !p.allocation_id) throw new Error('Choose an allocation from this business.')
  if (action.kind === 'allocation') {
    textValue(action.input.name, 'Allocation name')
    integer(action.input.amount_cents, 1, 100_000_000)
    if (!allocationCategories.includes(action.input.category)) throw new Error('Choose an allocation category.')
    const due = action.input.due_date
    if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) || new Date(`${due}T12:00:00Z`).toISOString().slice(0, 10) !== due || due < '2000-01-01' || due > '2100-12-31')) throw new Error('Choose a valid due date between 2000 and 2100.')
  }
  if (action.kind === 'withdrawal' || action.kind === 'correct_withdrawal') {
    integer(action.input.amount_cents, action.kind === 'correct_withdrawal' ? 0 : 1, 100_000_000)
    validDate(action.input.withdrawal_date)
    if (action.kind === 'correct_withdrawal') {
      if (!action.input.corrects_id) throw new Error('Choose the withdrawal being corrected.')
      textValue(action.input.correction_reason, 'Correction reason', 300)
    } else if (action.input.corrects_id || action.input.correction_reason) throw new Error('Use the correction action for a completed entry.')
  }
}

// Pure fictional repository reducer. Hosted authority is the database RPC.
export function applyMoneyRequest(plan: MoneyPlan, request: MoneyRequest, now = new Date().toISOString()): MoneyPlan {
  validateMoneyAction(request)
  integer(request.expectedRevision, 0, 2_147_483_646)
  if (!request.key) throw new Error('A retry key is required.')
  const prior = plan.events.find(e => e.id === request.key)
  if (prior) {
    if (prior.kind !== request.kind || prior.revision !== request.expectedRevision + 1 || JSON.stringify(prior.payload) !== JSON.stringify(request.input)) throw new Error('Retry key belongs to a different money-plan change.')
    return plan
  }
  if (plan.revision !== request.expectedRevision) throw Object.assign(new Error('Your money plan changed in another tab. Reload the plan, review the latest balance and try again.'), { definitive: true, conflict: true })
  const next = structuredClone(plan), p = request.input, revision = plan.revision + 1
  let previous: Allocation | null = null
  if ('allocation_id' in p && p.allocation_id) {
    previous = next.allocations.find(a => a.id === p.allocation_id && a.business_id === plan.business_id && a.status === 'active') ?? null
    if (!previous) throw new Error('Active allocation not accessible.')
    previous = structuredClone(previous)
  }
  if (request.kind === 'allocation') {
    const { allocation_id, ...fields } = request.input
    const record: Allocation = { ...fields, name: fields.name.trim(), id: allocation_id ?? request.key, business_id: plan.business_id, status: 'active' }
    if (allocation_id) next.allocations[next.allocations.findIndex(a => a.id === allocation_id)] = record
    else next.allocations.push(record)
  } else if (request.kind === 'cancel' || request.kind === 'settle') {
    next.allocations.find(a => a.id === request.input.allocation_id)!.status = request.kind === 'cancel' ? 'cancelled' : 'settled'
  } else if (request.kind === 'withdrawal' || request.kind === 'correct_withdrawal') {
    const w = request.input
    if (w.corrects_id && (!plan.withdrawals.some(x => x.id === w.corrects_id && x.business_id === plan.business_id) || plan.withdrawals.some(x => x.corrects_id === w.corrects_id))) throw new Error('Withdrawal not accessible or already corrected. Reload the plan.')
    next.withdrawals.unshift({ id: request.key, business_id: plan.business_id, amount_cents: w.amount_cents, withdrawal_date: w.withdrawal_date, note: w.note, corrects_id: w.corrects_id, correction_reason: w.correction_reason, created_at: now })
  }
  if ('cash_cents' in p) next.snapshots.unshift({ id: request.key, business_id: plan.business_id, revision, cash_cents: p.cash_cents, confirmed_at: now, source: request.kind, note: p.note })
  next.events.unshift({ id: request.key, business_id: plan.business_id, revision, kind: request.kind, payload: structuredClone(p), previous_allocation: previous, created_at: now })
  next.revision = revision
  moneyTotals(next)
  return next
}
