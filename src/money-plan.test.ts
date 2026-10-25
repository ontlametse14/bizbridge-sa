import { describe, expect, it } from 'vitest'
import { applyMoneyRequest, emptyMoneyPlan, moneyTotals, validateMoneyAction, withdrawalPreview, type MoneyAction, type MoneyPlan, type MoneyRequest } from './money-plan'
import { businessToday, cents, metrics } from './domain'
import { sampleWorkspace } from './demo'
const id = () => crypto.randomUUID()
const request = (plan: MoneyPlan, action: MoneyAction): MoneyRequest => ({ ...action, key: id(), expectedRevision: plan.revision })
const change = (plan: MoneyPlan, action: MoneyAction) => applyMoneyRequest(plan, request(plan, action))
const confirm = (cash_cents: number): MoneyAction => ({ kind: 'confirm', input: { cash_cents, note: '' } })
function fixture() {
  let p = change(emptyMoneyPlan(id()), confirm(120000))
  for (const [name, amount_cents, category] of [['Stock', 70000, 'Replacement stock'], ['Bills', 20000, 'Upcoming bills'], ['Buffer', 10000, 'Emergency buffer']] as const) p = change(p, { kind: 'allocation', input: { allocation_id: null, name, amount_cents, category, due_date: null, note: '' } })
  return p
}
const withdrawal = (): MoneyAction => ({ kind: 'withdrawal', input: { amount_cents: 15000, cash_cents: 105000, withdrawal_date: businessToday(), note: '', confirmed: true, corrects_id: null, correction_reason: '' } })
describe('Money Split snapshots and planning', () => {
  it('A: allocates R1,000 from R1,200, leaving R200', () => expect(moneyTotals(fixture())).toMatchObject({ cash: 120000, allocated: 100000, unallocated: 20000 }))
  it('B: R400 preview gives a R200 shortfall and is read-only', () => { const p = fixture(), original = structuredClone(p); expect(withdrawalPreview(p, 40000)).toEqual({ before: 20000, after: -20000, shortfall: 20000 }); expect(p).toEqual(original) })
  it('C: records R150 with R1,050 actual cash, without deducting twice', () => { const p = change(fixture(), withdrawal()); expect(moneyTotals(p).unallocated).toBe(5000); expect(p.withdrawals).toHaveLength(1); expect(p.snapshots).toHaveLength(2) })
  it('D: settling R200 with R1,000 cash leaves R800 allocated and R200 unallocated', () => { const p = fixture(); const next = change(p, { kind: 'settle', input: { allocation_id: p.allocations[1].id, cash_cents: 100000, note: '', confirmed: true } }); expect(moneyTotals(next)).toMatchObject({ cash: 100000, allocated: 80000, unallocated: 20000 }); expect(next.allocations[1].status).toBe('settled') })
  it('reconfirming a snapshot never replays withdrawals or erases allocations', () => { let p = change(fixture(), withdrawal()); p = change(p, confirm(105000)); expect(moneyTotals(p).unallocated).toBe(5000); expect(p.withdrawals).toHaveLength(1); expect(p.allocations).toHaveLength(3); expect(p.snapshots).toHaveLength(3) })
  it('cancellation releases a planning amount without income or cash changes', () => { const p = fixture(); const next = change(p, { kind: 'cancel', input: { allocation_id: p.allocations[0].id, note: 'No longer needed' } }); expect(moneyTotals(next)).toMatchObject({ cash: 120000, allocated: 30000 }); expect(next.snapshots).toEqual(p.snapshots); expect(next.events[0].previous_allocation).toEqual(p.allocations[0]) })
  it('shows a negative unallocated balance instead of clamping', () => expect(moneyTotals(change(fixture(), confirm(10000))).unallocated).toBe(-90000))
  it('distinguishes unconfirmed cash from confirmed zero', () => { const p = emptyMoneyPlan(id()); expect(moneyTotals(p).cash).toBeNull(); expect(() => withdrawalPreview(p, 100)).toThrow('Confirm'); expect(moneyTotals(change(p, confirm(0))).cash).toBe(0) })
  it('editing changes only active allocation planning and retains old values', () => { const p = fixture(), a = p.allocations[0]; const next = change(p, { kind: 'allocation', input: { allocation_id: a.id, name: a.name, category: a.category, amount_cents: 60000, due_date: '2030-01-01', note: 'Revised' } }); expect(moneyTotals(next).unallocated).toBe(30000); expect(next.events[0].previous_allocation?.amount_cents).toBe(70000); expect(next.snapshots).toEqual(p.snapshots) })
  it('retries the same persisted key exactly once, including after later changes', () => { const p = fixture(), r = request(p, withdrawal()); let next = applyMoneyRequest(p, r); next = change(next, confirm(105000)); expect(applyMoneyRequest(next, r)).toEqual(next); expect(next.withdrawals).toHaveLength(1) })
  it('rejects a changed retry payload', () => { const p = fixture(), r = request(p, confirm(5)); const next = applyMoneyRequest(p, r); expect(() => applyMoneyRequest(next, { ...r, kind: 'confirm', input: { cash_cents: 6, note: '' } })).toThrow('Retry key') })
  it('rejects a stale concurrent change without partial mutation', () => { const p = fixture(), stale = request(p, withdrawal()); const next = change(p, confirm(120000)), original = structuredClone(next); expect(() => applyMoneyRequest(next, stale)).toThrow('another tab'); expect(next).toEqual(original) })
  it('rejects foreign or already settled allocation IDs without partial mutation', () => { const p = fixture(), original = structuredClone(p); expect(() => change(p, { kind: 'settle', input: { allocation_id: id(), cash_cents: 0, note: '', confirmed: true } })).toThrow('accessible'); expect(p).toEqual(original) })
  it('corrections append history and replace actual cash without replaying amounts', () => { let p = change(fixture(), withdrawal()); const original = p.withdrawals[0]; p = change(p, { kind: 'correct_withdrawal', input: { amount_cents: 10000, cash_cents: 110000, withdrawal_date: businessToday(), note: '', confirmed: true, corrects_id: original.id, correction_reason: 'Amount was R100' } }); expect(p.withdrawals).toHaveLength(2); expect(p.withdrawals[1]).toEqual(original); expect(moneyTotals(p).unallocated).toBe(10000); expect(p.withdrawals[0].corrects_id).toBe(original.id) })
  it('Money Split leaves the complete sales/expenses/stock workspace unchanged', () => { const workspace = sampleWorkspace(), before = structuredClone(workspace), profit = metrics(workspace.sales, workspace.expenses); change(fixture(), withdrawal()); expect(workspace).toEqual(before); expect(metrics(workspace.sales, workspace.expenses)).toEqual(profit) })
})
describe('Money Split validation', () => {
  it.each(['', '-1', '1.001', 'cash', 'Infinity', '1000001'])('rejects invalid rand input %s', value => expect(() => cents(value)).toThrow())
  it.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER])('rejects invalid cash cents %s', value => expect(() => validateMoneyAction(confirm(value))).toThrow())
  it('requires the explicit already-reflected confirmation', () => { const a = withdrawal(); if ('confirmed' in a.input) a.input.confirmed = false; expect(() => validateMoneyAction(a)).toThrow('Confirm') })
  it('rejects zero completed withdrawals, future withdrawal dates and absent correction reasons', () => { const a = withdrawal(); if ('withdrawal_date' in a.input) { a.input.amount_cents = 0; expect(() => validateMoneyAction(a)).toThrow(); a.input.amount_cents = 1; a.input.withdrawal_date = '2100-01-01'; expect(() => validateMoneyAction(a)).toThrow() } })
  it('rejects invalid allocation dates, names and zero amounts', () => { const a: MoneyAction = { kind: 'allocation', input: { allocation_id: null, name: 'Bill', category: 'Other', amount_cents: 1, due_date: '2030-02-30', note: '' } }; expect(() => validateMoneyAction(a)).toThrow('date'); a.input.due_date = null; a.input.name = ''; expect(() => validateMoneyAction(a)).toThrow('name'); a.input.name = 'Bill'; a.input.amount_cents = 0; expect(() => validateMoneyAction(a)).toThrow() })
})
