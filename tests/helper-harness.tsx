// Development-only component fixtures. Never part of the production entry.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { BizBridgeHelper, WorkspaceHelper } from '../src/BizBridgeHelper'
import { WorkspaceProvider } from '../src/store'
import { sampleWorkspace } from '../src/demo'
import type { HelperContext } from '../src/helper-guidance'
import '../src/styles.css'

export function Harness() {
  const [state, setState] = useState('real-a')
  const [fixture] = useState(() => sampleWorkspace())
  const identity = state === 'real-b' || state === 'remote-b' ? 'fixture-b' : 'fixture-a'
  const data = structuredClone(fixture)
  data.business = { ...data.business!, owner_id: identity, id: state === 'business-b' ? 'business-b' : identity, name: `${identity} private business` }
  if (state === 'empty') { data.products = []; data.sales = []; data.expenses = [] }
  const context: HelperContext = { mode: state === 'demo' ? 'demo' : state === 'anonymous' ? 'anonymous' : 'real', userId: state === 'anonymous' ? null : identity, data: state === 'anonymous' ? null : data, error: state === 'failed' ? 'Fixture request failed' : '', loading: state === 'loading', retrievedAt: '2026-10-25T10:00:00Z', period: 'all' }
  const session: Session = { user: { id: identity, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-25T10:00:00Z' }, access_token: 'fixture-only', refresh_token: 'fixture-only', token_type: 'bearer', expires_in: 3600 }
  return <div style={{ display: 'flex', gap: 8, padding: 10 }}><label>Test context <select aria-label="Test context" value={state} onChange={e => setState(e.target.value)}>{['real-a','real-b','business-b','anonymous','demo','empty','failed','loading','remote-a','remote-b'].map(s => <option key={s}>{s}</option>)}</select></label>
    {state.startsWith('remote-') ? <WorkspaceProvider key={identity} demo={false} session={session} onLogout={() => setState('anonymous')}><WorkspaceHelper /></WorkspaceProvider> : <BizBridgeHelper context={context} />}
  </div>
}
if (!import.meta.env.DEV) throw new Error('Test fixtures are development-only.')
createRoot(document.getElementById('root')!).render(<BrowserRouter><Harness /></BrowserRouter>)
