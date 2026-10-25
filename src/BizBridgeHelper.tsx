import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CircleHelp, Send, X } from 'lucide-react'
import { answerQuestion, helperExplanation, helperScope, topics, welcomeMessage, type HelperContext, type HelperIntent, type HelperReply } from './helper-guidance'
import { useWorkspace } from './store'

const publicContext: HelperContext = { mode: 'anonymous', userId: null, data: null, loading: false, error: '', retrievedAt: null, period: 'month' }
export function WorkspaceHelper() {
  const { data, loading, error, demo, session, retrievedAt, reportingPeriod } = useWorkspace()
  return <BizBridgeHelper context={{ data, loading, error, mode: demo ? 'demo' : 'real', userId: session?.user.id ?? null, retrievedAt, period: reportingPeriod }} />
}
export function BizBridgeHelper({ context = publicContext }: { context?: HelperContext }) {
  // A keyed subtree discards conversation, draft, open state and all DOM
  // answers synchronously on account, business or real/demo changes.
  return <HelperSession key={helperScope(context)} context={context} />
}
function HelperSession({ context }: { context: HelperContext }) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState('')
  const [questions, setQuestions] = useState<{ id: number; text: string }[]>([])
  const [cleared, setCleared] = useState(false)
  const nextId = useRef(0), trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLElement>(null), log = useRef<HTMLDivElement>(null)
  const id = useId(), navigate = useNavigate()
  function close() { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    input.current?.focus({ preventScroll: true })
    const viewport = window.visualViewport
    function fit() {
      const height = viewport?.height ?? window.innerHeight
      panel.current?.style.setProperty('--helper-top', `${(viewport?.offsetTop ?? 0) + 80}px`)
      panel.current?.style.setProperty('--helper-height', `${Math.max(120, height - 92)}px`)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { event.preventDefault(); setOpen(false); trigger.current?.focus() }
    }
    fit(); window.addEventListener('keydown', escape); window.addEventListener('resize', fit)
    viewport?.addEventListener('resize', fit); viewport?.addEventListener('scroll', fit)
    return () => { window.removeEventListener('keydown', escape); window.removeEventListener('resize', fit); viewport?.removeEventListener('resize', fit); viewport?.removeEventListener('scroll', fit) }
  }, [open])
  useEffect(() => {
    // Keep welcome guidance visible after clearing; never move focus on data refresh.
    if (log.current) log.current.scrollTop = questions.length ? log.current.scrollHeight : 0
  }, [questions.length, open])
  function ask(text: string) {
    const value = text.trim().slice(0, 500)
    if (!value) return
    setQuestions(previous => [...previous.slice(-19), { id: ++nextId.current, text: value }])
    setDraft(''); setCleared(false); input.current?.focus({ preventScroll: true })
  }
  function submit(event: FormEvent) { event.preventDefault(); ask(draft) }
  function choose(intent: HelperIntent) { ask(topics.find(t => t.id === intent)!.question) }
  function action(path: string) { close(); navigate(path) }
  function reply(answer: HelperReply) {
    return <div className="helper-answer">
      {answer.source && <p className="helper-source">{answer.source}</p>}
      {answer.title && <h3>{answer.title}</h3>}
      {answer.paragraphs.map((p, index) => <p key={index}>{p}</p>)}
      {answer.rows && answer.rows.length > 0 && <dl className="helper-values">{answer.rows.map((row, index) => <div key={index}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>}
      {answer.warning && <p className="helper-warning">{answer.warning}</p>}
      {answer.actions && <div className="helper-actions">{answer.actions.map(a => <button type="button" className="text-button" key={a.label} onClick={() => action(a.path)}>{a.label}<ArrowRight size={14} aria-hidden="true" /></button>)}</div>}
      {answer.choices && <div className="helper-choices">{topics.filter(t => answer.choices!.includes(t.id)).map(t => <button type="button" key={t.id} onClick={() => choose(t.id)}>{t.question}</button>)}</div>}
    </div>
  }
  return <>
    <button ref={trigger} type="button" className="btn secondary helper-trigger" aria-label="Help" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => open ? close() : setOpen(true)}><CircleHelp size={18} aria-hidden="true" />Help</button>
    {open && <section ref={panel} id={id} className="helper-panel" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
      <header className="helper-head"><div><h2 id={`${id}-title`}>BizBridge Helper</h2><p>Guided help for your business.</p></div><button type="button" className="icon-button" aria-label="Close BizBridge Helper" onClick={close}><X size={21} /></button></header>
      <div ref={log} className="helper-conversation">
        <p id={`${id}-description`} className="helper-explanation">{helperExplanation}</p>
        <p className="helper-welcome">{welcomeMessage}</p>
        <div className="helper-choices" aria-label="Suggested questions">{topics.map(t => <button type="button" key={t.id} onClick={() => choose(t.id)}>{t.question}</button>)}</div>
        <p className="helper-memory">Read-only · Conversation stays in memory · Latest 20 questions</p>
        <div role="log" aria-label="Helper conversation" aria-live="polite" aria-relevant="additions text">
          {questions.map(q => <div className="helper-turn" key={q.id}><p className="helper-question"><span className="sr-only">You: </span>{q.text}</p>{reply(answerQuestion(q.text, context))}</div>)}
        </div>
        {cleared && <p role="status">Conversation cleared.</p>}
      </div>
      <form className="helper-composer" onSubmit={submit}>
        <div className="helper-composer-label"><label htmlFor={`${id}-input`}>Ask a supported question</label><button type="button" className="text-button" onClick={() => { setQuestions([]); setDraft(''); setCleared(true); input.current?.focus() }}>Clear conversation</button></div>
        <div className="helper-input-row"><input ref={input} id={`${id}-input`} value={draft} onChange={e => setDraft(e.target.value)} maxLength={500} autoComplete="off" placeholder="e.g. low stock" /><button type="submit" className="btn primary" aria-label="Send question" disabled={!draft.trim()}><Send size={18} /></button></div>
      </form>
    </section>}
  </>
}
