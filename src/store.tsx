import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { loadWorkspace, mutateBackend, supabase } from './backend'
import { mutateDemo, readDemo, type Mutation } from './demo'
import { emptyWorkspace, type Workspace } from './domain'

type Store = {
  data: Workspace; loading: boolean; error: string; demo: boolean; session: Session | null;
  retrievedAt: string | null; reportingPeriod: string; setReportingPeriod: (period: string) => void;
  refresh: () => Promise<void>; mutate: (action: Mutation) => Promise<void>; logout: () => Promise<void>
}
const Context = createContext<Store | null>(null)
// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error('Workspace unavailable.'); return value }
export function WorkspaceProvider({ children, demo, session, onLogout }: { children: ReactNode; demo: boolean; session: Session | null; onLogout: () => void }) {
  const [data, setData] = useState<Workspace>(emptyWorkspace)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retrievedAt, setRetrievedAt] = useState<string | null>(null)
  const [reportingPeriod, setReportingPeriod] = useState('month')
  const active = useRef(true)
  const refreshVersion = useRef(0)
  async function refresh() {
    const version = ++refreshVersion.current
    setError('')
    try { const next = demo ? readDemo() : await loadWorkspace(); if (active.current && version === refreshVersion.current) { setData(next); setRetrievedAt(new Date().toISOString()) } }
    catch (e) { if (active.current && version === refreshVersion.current) setError(e instanceof Error ? e.message : 'Could not load your records.') }
    finally { if (active.current && version === refreshVersion.current) setLoading(false) }
  }
  useEffect(() => {
    active.current = true
    const requestEpoch = refreshVersion
    // Read from external storage after the effect has installed its cleanup.
    const initial = window.setTimeout(() => { void refresh() }, 0)
    const sync = (e: StorageEvent) => { if (demo && e.key === 'bizbridge.demo.v1') void refresh() }
    window.addEventListener('storage', sync)
    return () => { active.current = false; ++requestEpoch.current; window.clearTimeout(initial); window.removeEventListener('storage', sync) }
    // Provider is remounted for every auth identity or mode change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function mutate(action: Mutation) {
    if (demo) { const next = await mutateDemo(action); if (active.current) { setData(next); setRetrievedAt(new Date().toISOString()) } }
    else { await mutateBackend(data.business?.id, action); await refresh() }
  }
  async function logout() {
    active.current = false; ++refreshVersion.current; setData(emptyWorkspace()); setRetrievedAt(null); setError('')
    Object.keys(sessionStorage).filter(k => k.startsWith('bizbridge.pending.')).forEach(k => sessionStorage.removeItem(k))
    sessionStorage.removeItem('bizbridge.preview')
    // Drop the persisted session immediately, including if the network is down.
    if (!demo) localStorage.removeItem('bizbridge.auth')
    onLogout()
    if (!demo && supabase) { try { await supabase.auth.signOut({ scope: 'local' }) } finally { localStorage.removeItem('bizbridge.auth') } }
  }
  return <Context.Provider value={{ data, loading, error, demo, session, retrievedAt, reportingPeriod, setReportingPeriod, refresh, mutate, logout }}>{children}</Context.Provider>
}
