import { cloneElement, useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react'
import { ArrowRight, CheckCircle2, Inbox, X, AlertCircle } from 'lucide-react'
export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-symbol" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M8 29V15m24 14V15M8 20c6 0 6-10 12-10s6 10 12 10M8 27h24" /></svg></span>{!compact && <span>BizBridge <b>SA</b></span>}</div>
}
export function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'error' | 'success' | 'warning' }) {
  const Icon = kind === 'success' ? CheckCircle2 : AlertCircle
  return <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon size={18} /><div>{children}</div></div>
}
export function Empty({ title, children, action, onAction }: { title: string; children: ReactNode; action?: string; onAction?: () => void }) {
  return <div className="empty"><span className="empty-icon"><Inbox size={26} /></span><h3>{title}</h3><p>{children}</p>{action && <button className="btn primary" onClick={onAction}>{action}<ArrowRight size={16} /></button>}</div>
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    d?.showModal()
    return () => { d?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className="modal" onCancel={e => { e.preventDefault(); onClose() }} aria-label={title}>
    <div className="modal-head"><div><span className="eyebrow">YOUR BUSINESS RECORDS</span><h2>{title}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={21} /></button></div>{children}
  </dialog>
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactElement<{ id?: string; 'aria-describedby'?: string }> }) {
  const id = useId()
  return <div className="field"><label htmlFor={id}>{label}</label>{cloneElement(children, { id, 'aria-describedby': hint ? `${id}-hint` : undefined })}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>
}
export function FormActions({ busy, onCancel, label = 'Save changes' }: { busy: boolean; onCancel: () => void; label?: string }) {
  return <div className="form-actions"><button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>Cancel</button><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : label}<ArrowRight size={16} /></button></div>
}
