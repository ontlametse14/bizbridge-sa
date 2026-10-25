// Synthetic lifecycle fixture; all backend traffic is intercepted in its tests.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { WorkspaceProvider } from '../src/store'
import { MoneySplit } from '../src/MoneySplit'
import '../src/styles.css'
export function MoneyHarness() {
  const [state, setState] = useState('a')
  const session: Session = { user: { id: `fixture-${state}`, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-25T00:00:00Z' }, access_token: 'fixture-only', refresh_token: 'fixture-only', token_type: 'bearer', expires_in: 3600 }
  return <><label>Test account <select aria-label="Test account" value={state} onChange={e => setState(e.target.value)}>{['a','b','logged-out'].map(x => <option key={x}>{x}</option>)}</select></label>{state === 'logged-out' ? <p>Signed out fixture</p> : <WorkspaceProvider key={state} demo={false} session={session} onLogout={() => setState('logged-out')}><MoneySplit /></WorkspaceProvider>}</>
}
if (!import.meta.env.DEV) throw new Error('Development fixtures only.')
createRoot(document.getElementById('root')!).render(<BrowserRouter><MoneyHarness /></BrowserRouter>)
