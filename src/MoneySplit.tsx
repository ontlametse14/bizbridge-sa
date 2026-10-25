import { useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, History, Plus, RefreshCw, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Empty, Field, FormActions, Modal, Notice } from './components'
import { businessToday, cents, displayDate, money } from './domain'
import { allocationCategories, confirmationTime, moneyTotals, validateMoneyAction, withdrawalPreview, type Allocation, type AllocationCategory, type MoneyAction, type MoneyPlan, type MoneyRequest, type Withdrawal } from './money-plan'
import { useMoneyPlan } from './money-store'
import { useWorkspace } from './store'

type Editor = { kind: 'confirm' } | { kind: 'allocation'; allocation?: Allocation } | { kind: 'cancel' | 'settle'; allocation: Allocation } | { kind: 'withdrawal' } | { kind: 'correct_withdrawal'; withdrawal: Withdrawal } | { kind: 'check' }
const titles: Record<Editor['kind'], string> = { confirm: 'Update cash balance', allocation: 'Plan my money', cancel: 'Cancel allocation', settle: 'Mark allocation paid / settled', withdrawal: 'Record a withdrawal already made', correct_withdrawal: 'Correct a completed withdrawal', check: 'Check a personal withdrawal' }
const actionNames: Record<MoneyAction['kind'], string> = { confirm: 'Cash confirmed', allocation: 'Allocation planned or revised', cancel: 'Allocation cancelled', settle: 'Allocation settled and cash confirmed', withdrawal: 'Completed personal withdrawal', correct_withdrawal: 'Withdrawal correction and cash confirmed' }

export function MoneySplit() {
  const { data, demo, session } = useWorkspace()
  if (!data.business) return <Notice>Create your business profile to start a money plan.</Notice>
  return <MoneySplitSession key={`${demo ? 'demo' : session?.user.id}:${data.business.id}`} businessId={data.business.id} demo={demo} userId={session?.user.id ?? ''} />
}
function MoneySplitSession({ businessId, demo, userId }: { businessId: string; demo: boolean; userId: string }) {
  const store = useMoneyPlan(businessId, demo, userId)
  const [editor, setEditor] = useState<Editor | null>(null), [message, setMessage] = useState(''), [failure, setFailure] = useState('')
  const { plan, loading, error, pending, busy } = store
  const totals = plan ? moneyTotals(plan) : null
  async function save(request: MoneyRequest) {
    setFailure(''); setMessage('')
    try {
      if (await store.save(request)) { setEditor(null); setMessage('Money plan saved. Sales, expenses, stock and profit are unchanged.') }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Could not save your money plan. Please try again.')
      setEditor(null)
    }
  }
  function open(next: Editor) { setMessage(''); setFailure(''); setEditor(next) }
  const disabled = busy || Boolean(pending) || loading || !plan
  return <section className="money-split">
    <div className="page-head"><div><div className="eyebrow">A PLAN FOR THE MONEY YOU HAVE</div><h1>Money Split</h1><p>See what is earmarked for your business and what is not yet allocated.</p></div><button className="btn secondary" disabled={busy || loading} onClick={() => { setFailure(''); void store.reload() }}><RefreshCw size={16} />Reload plan</button></div>
    <div className="money-intro"><Wallet size={24} aria-hidden="true" /><p>This tool organises your money plan. It does not move, lock or separate money in your bank account.</p></div>
    {demo && <p className="report-note">Fictional demo plan only. Enter illustrative amounts; no real business records are changed.</p>}
    {message && <Notice kind="success">{message}</Notice>}{failure && <Notice kind="error">{failure}</Notice>}
    {pending && <Notice kind="warning"><p>A submitted money-plan change is awaiting confirmation. Retry the same saved request; its key prevents duplicates. New changes are paused until its outcome is known.</p><button className="btn secondary" disabled={busy} onClick={() => void save(pending)}>{busy ? 'Checking…' : 'Retry submitted change'}</button></Notice>}
    {loading ? <div className="loading-screen" role="status"><span className="loader" /><p>Loading your private money plan…</p></div> : error ? <Notice kind="error">Unable to load Money Split: {error} No cash balance is available. Use Reload plan to try again.</Notice> : plan && totals && <>
      <div className="money-confirmation"><span className="eyebrow">Owner-entered balance — not bank-verified.</span><h2>{totals.snapshot ? `Last confirmed ${confirmationTime(totals.snapshot.confirmed_at)}` : 'Cash balance not confirmed yet'}</h2><p>Africa/Johannesburg · Unrecorded activity can make this plan out of date. Reconfirm your actual cash before relying on a new withdrawal check.</p></div>
      <div className="money-stats">
        <div className="stat-card"><span className="stat-label">Business cash <Wallet size={17} /></span><strong className="stat-value" data-testid="money-cash">{totals.cash === null ? 'Not confirmed' : money(totals.cash)}</strong><span className="stat-note">Current owner-confirmed snapshot</span></div>
        <div className="stat-card"><span className="stat-label">Allocated to business needs</span><strong className="stat-value" data-testid="money-allocated">{money(totals.allocated)}</strong><span className="stat-note">{totals.active.length} active, outstanding {totals.active.length === 1 ? 'allocation' : 'allocations'}</span></div>
        <div className={`stat-card ${totals.unallocated !== null && totals.unallocated < 0 ? 'money-shortfall' : 'profit'}`}><span className="stat-label">Unallocated balance</span><strong className="stat-value" data-testid="money-unallocated">{totals.unallocated === null ? 'Not available' : money(totals.unallocated)}</strong><span className="stat-note">Confirmed cash minus outstanding allocations</span></div>
      </div>
      {totals.unallocated !== null && totals.unallocated < 0 && <Notice kind="warning">Your plan has a {money(-totals.unallocated)} shortfall. Allocations exceed confirmed cash. Review your cash and deliberately revise your allocations if needed.</Notice>}
      <div className="money-actions"><button className="btn primary" disabled={disabled} onClick={() => open({ kind: 'confirm' })}><RefreshCw size={16} />Update cash balance</button><button className="btn secondary" disabled={disabled} onClick={() => open({ kind: 'allocation' })}><Plus size={16} />Plan my money</button><button className="btn secondary" disabled={disabled} onClick={() => open({ kind: 'check' })}>Check a personal withdrawal</button><button className="btn secondary" disabled={disabled} onClick={() => open({ kind: 'withdrawal' })}>Record a completed withdrawal</button></div>
      <div className="panel money-allocation-panel"><div className="panel-heading"><div><h2>Business allocations</h2><p>Planning amounts, not separate bank balances. Only active allocations count.</p></div></div>
        {!totals.active.length ? <Empty title="Give your business needs a place">Plan replacement stock, bills, transport or a buffer. Creating an allocation does not spend cash or record an expense.</Empty> : <ul className="money-allocation-list">{totals.active.map(a => <li key={a.id}><div><h3>{a.name}</h3><p>{a.category}{a.due_date ? ` · Due ${displayDate(a.due_date)}` : ''}</p>{a.note && <p>{a.note}</p>}</div><strong>{money(a.amount_cents)}</strong><div className="money-row-actions"><button className="text-button" disabled={disabled} aria-label={`Edit ${a.name}`} onClick={() => open({ kind: 'allocation', allocation: a })}>Edit</button><button className="text-button" disabled={disabled} aria-label={`Settle ${a.name}`} onClick={() => open({ kind: 'settle', allocation: a })}><CheckCircle2 size={15} />Paid / settled</button><button className="text-button" disabled={disabled} aria-label={`Cancel ${a.name}`} onClick={() => open({ kind: 'cancel', allocation: a })}>Cancel allocation</button></div></li>)}</ul>}
      </div>
      <div className="money-history-grid">
        <section className="panel"><div className="panel-heading"><div><h2>Personal withdrawal history</h2><p>Completed entries stay separate from operating expenses.</p></div></div>{!plan.withdrawals.length ? <Empty title="No completed withdrawals">A withdrawal check is just a preview. Only withdrawals you explicitly record appear here.</Empty> : <ul className="money-history">{plan.withdrawals.map(w => {
          const corrected = plan.withdrawals.some(other => other.corrects_id === w.id)
          return <li key={w.id}><div className="money-history-title"><strong>{money(w.amount_cents)}</strong><span className="badge neutral">{corrected ? 'Superseded by correction' : w.corrects_id ? 'Correction' : 'Recorded'}</span></div><p>{displayDate(w.withdrawal_date)}{w.note ? ` · ${w.note}` : ''}</p>{w.correction_reason && <p>Correction reason: {w.correction_reason}</p>}<p>Cash confirmed afterward: {money(plan.snapshots.find(s => s.id === w.id)!.cash_cents)}</p>{!corrected && <button className="text-button" disabled={disabled} onClick={() => open({ kind: 'correct_withdrawal', withdrawal: w })}>Add correction<ArrowRight size={14} /></button>}</li>
        })}</ul>}</section>
        <section className="panel"><div className="panel-heading"><div><h2>Cash confirmation history</h2><p>Each confirmation replaces the current snapshot.</p></div></div>{!plan.snapshots.length ? <Empty title="Start with actual cash">Confirm cash you have now, including money you intend to earmark. Expected payments, stock value and available credit are not cash.</Empty> : <ul className="money-history">{plan.snapshots.map(s => <li key={s.id}><strong>{money(s.cash_cents)}</strong><p>{confirmationTime(s.confirmed_at)} · Africa/Johannesburg</p><p>{actionNames[s.source as MoneyAction['kind']]}{s.note ? ` · ${s.note}` : ''}</p></li>)}</ul>}</section>
      </div>
      <details className="panel money-audit"><summary><History size={17} />Plan change history ({plan.events.length})</summary><ul className="money-history">{plan.events.map(e => <li key={e.id}><strong>#{e.revision} · {actionNames[e.kind]}</strong><p>{confirmationTime(e.created_at)}</p>{'name' in e.payload && <p>{e.payload.name} · {money(e.payload.amount_cents)}</p>}{e.previous_allocation && <p>Previous allocation: {e.previous_allocation.name}, {money(e.previous_allocation.amount_cents)} · {e.previous_allocation.status}</p>}{e.payload.note && <p>{e.payload.note}</p>}</li>)}</ul>{!plan.events.length && <p className="money-audit-empty">No money-plan changes yet.</p>}</details>
      <p className="report-note">Unallocated does not mean “safe to spend”. This plan may omit needs or recent activity. It is not a bank account, payment service, salary calculation or tax tool.</p>
    </>}
    {editor && plan && !loading && !error && <Modal title={titles[editor.kind]} onClose={() => { if (!busy) setEditor(null) }}>{editor.kind === 'check' ? <WithdrawalChecker key={plan.revision} plan={plan} onUpdate={() => open({ kind: 'confirm' })} /> : <MoneyForm editor={editor} revision={plan.revision} busy={busy} onSave={save} onCancel={() => setEditor(null)} />}</Modal>}
  </section>
}

function MoneyForm({ editor, revision, busy, onSave, onCancel }: { editor: Exclude<Editor, { kind: 'check' }>; revision: number; busy: boolean; onSave: (request: MoneyRequest) => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState(''), [expectedRevision] = useState(revision)
  const a = 'allocation' in editor ? editor.allocation : undefined, w = editor.kind === 'correct_withdrawal' ? editor.withdrawal : undefined
  const cash = ['confirm', 'settle', 'withdrawal', 'correct_withdrawal'].includes(editor.kind)
  const withdrawal = editor.kind === 'withdrawal' || editor.kind === 'correct_withdrawal'
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    const fd = new FormData(event.currentTarget), value = (key: string) => String(fd.get(key) ?? '').trim(), note = value('note')
    try {
      let action: MoneyAction
      if (editor.kind === 'allocation') action = { kind: 'allocation', input: { allocation_id: a?.id ?? null, name: value('name'), category: value('category') as AllocationCategory, amount_cents: cents(value('amount'))!, due_date: value('due') || null, note } }
      else if (editor.kind === 'cancel') action = { kind: 'cancel', input: { allocation_id: editor.allocation.id, note } }
      else if (editor.kind === 'settle') action = { kind: 'settle', input: { allocation_id: editor.allocation.id, cash_cents: cents(value('cash'))!, note, confirmed: fd.get('confirmed') === 'on' } }
      else if (editor.kind === 'confirm') action = { kind: 'confirm', input: { cash_cents: cents(value('cash'))!, note } }
      else action = { kind: editor.kind, input: { amount_cents: cents(value('amount'))!, withdrawal_date: value('date'), note, cash_cents: cents(value('cash'))!, confirmed: fd.get('confirmed') === 'on', corrects_id: w?.id ?? null, correction_reason: value('reason') } }
      validateMoneyAction(action); setError(''); void onSave({ ...action, key: crypto.randomUUID(), expectedRevision })
    } catch (e) { setError(e instanceof Error ? e.message : 'Check your inputs.') }
  }
  const label = editor.kind === 'confirm' ? 'Confirm current cash' : editor.kind === 'allocation' ? 'Save allocation' : editor.kind === 'cancel' ? 'Release allocation' : editor.kind === 'settle' ? 'Settle and confirm cash' : w ? 'Save correction and cash' : 'Save withdrawal and cash'
  return <form onSubmit={submit}>{error && <Notice kind="error">{error}</Notice>}<fieldset disabled={busy}>
    {editor.kind === 'allocation' && <><Field label="Name"><input name="name" required maxLength={120} defaultValue={a?.name} placeholder="e.g. Next stock order" /></Field><Field label="Category"><select name="category" defaultValue={a?.category ?? allocationCategories[0]}>{allocationCategories.map(c => <option key={c}>{c}</option>)}</select></Field><Field label="Amount still earmarked (R)" hint="Use a positive amount. Cancel an allocation when no money needs to remain earmarked."><input name="amount" inputMode="decimal" required defaultValue={a ? (a.amount_cents / 100).toFixed(2) : ''} /></Field><Field label="Due date (optional)"><input name="due" type="date" min="2000-01-01" max="2100-12-31" defaultValue={a?.due_date ?? ''} /></Field><Notice>This plans money; it does not reduce cash, record an expense or change stock.</Notice></>}
    {editor.kind === 'cancel' && <Notice kind="warning">Release {money(editor.allocation.amount_cents)} earmarked for {editor.allocation.name}? This cancels the plan only. It does not increase cash or create income. The original entry remains in history.</Notice>}
    {editor.kind === 'settle' && <Notice>Mark {editor.allocation.name} ({money(editor.allocation.amount_cents)} earmarked) settled. Confirm your actual cash after paying. The allocation will stop counting and that cash snapshot will replace the old one together. No payment is deducted again. Business-expense recording remains a separate step in <Link to="/expenses">Expenses</Link>. Use Expenses for operating costs; keep inventory purchases separate.</Notice>}
    {withdrawal && <><Notice>{w ? 'This adds a correction linked to the original entry; it does not erase it. Enter R0 only if the original withdrawal never happened. Confirm actual cash now, including any later activity.' : 'Record a personal withdrawal already made outside this app. This does not move money or record a salary, sale or operating expense.'}</Notice><Field label="Withdrawal amount (R)"><input name="amount" inputMode="decimal" required defaultValue={w ? (w.amount_cents / 100).toFixed(2) : ''} /></Field><Field label="Withdrawal date"><input name="date" type="date" min="2000-01-01" max={businessToday()} required defaultValue={w?.withdrawal_date ?? businessToday()} /></Field>{w && <Field label="Correction reason"><input name="reason" required maxLength={300} /></Field>}</>}
    {cash && <><Field label={editor.kind === 'confirm' ? 'Current business cash (R)' : 'Actual current cash AFTER payment or withdrawal (R)'} hint="Enter cash you actually have, including amounts earmarked for business needs. Count each amount once across your cash/bank totals. Exclude available credit, expected payments, profit and stock value."><input name="cash" inputMode="decimal" required placeholder="0.00" /></Field><p className="form-intro">This replaces your current cash snapshot. Previous withdrawals are not replayed or deducted from it. Unrecorded activity may make it out of date.</p></>}
    {cash && editor.kind !== 'confirm' && <label className="money-checkbox"><input type="checkbox" name="confirmed" required /><span>{withdrawal ? 'The balance entered already reflects this withdrawal.' : 'The balance entered already reflects this payment.'}</span></label>}
    <Field label="Note (optional)"><textarea name="note" maxLength={500} rows={2} defaultValue={a?.note ?? w?.note ?? ''} /></Field>
    </fieldset><FormActions busy={busy} onCancel={onCancel} label={label} /></form>
}
function WithdrawalChecker({ plan, onUpdate }: { plan: MoneyPlan; onUpdate: () => void }) {
  const [result, setResult] = useState<ReturnType<typeof withdrawalPreview> | null>(null), [error, setError] = useState('')
  const totals = moneyTotals(plan)
  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try { const fd = new FormData(event.currentTarget); setResult(withdrawalPreview(plan, cents(String(fd.get('amount') ?? ''))!)); setError('') }
    catch (e) { setResult(null); setError(e instanceof Error ? e.message : 'Check the withdrawal amount.') }
  }
  return <><Notice kind="warning">Reconfirm your actual cash before relying on a new check. Unrecorded activity can make this plan out of date.</Notice><button className="text-button" onClick={onUpdate}>Update cash balance<ArrowRight size={15} /></button>{!totals.snapshot ? <Empty title="Confirm your cash first">No business cash balance is available yet.</Empty> : <form onSubmit={check}><p className="form-intro">Owner-entered balance — not bank-verified. Last confirmed {confirmationTime(totals.snapshot.confirmed_at)} · Africa/Johannesburg.</p><Field label="Proposed personal withdrawal (R)"><input name="amount" inputMode="decimal" required onChange={() => setResult(null)} /></Field><label className="money-checkbox"><input type="checkbox" required onChange={() => setResult(null)} /><span>I have checked my actual cash and it still matches this confirmed balance.</span></label><button className="btn primary" type="submit">Preview withdrawal</button>{error && <Notice kind="error">{error}</Notice>}{result && <div className="money-preview" aria-live="polite"><dl><div><dt>Unallocated now</dt><dd>{money(result.before)}</dd></div><div><dt>Unallocated after withdrawal</dt><dd>{money(result.after)}</dd></div></dl>{result.shortfall ? <Notice kind="warning">After this withdrawal, your plan would have a {money(result.shortfall)} shortfall. Business allocations have not been reduced. Review the plan deliberately.</Notice> : <Notice>The plan would have {money(result.after)} unallocated afterward. This is not a guarantee that a withdrawal is affordable.</Notice>}</div>}<p className="form-intro">Preview only. No withdrawal, balance or allocation is saved or changed. No money is moved.</p></form>}</>
}
