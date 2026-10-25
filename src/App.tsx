import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, Boxes, CircleHelp, Compass, LayoutDashboard, LogOut, Menu, Receipt, Settings, ShieldCheck, ShoppingBag, Wallet, X } from 'lucide-react'
import { configured, partialConfig, supabase } from './backend'
import { Brand, Field, Notice } from './components'
import { DEMO_STORAGE_KEY, sampleWorkspace } from './demo'
import { WorkspaceProvider, useWorkspace } from './store'
import { Dashboard, Expenses, GrowthGuide, Products, Sales, SettingsPage } from './pages'
import { ProfileForm } from './forms'
import { BizBridgeHelper, WorkspaceHelper } from './BizBridgeHelper'
import { MoneySplit } from './MoneySplit'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  const [demo, setDemo] = useState(sessionStorage.getItem('bizbridge.preview') === 'true')
  const [authError, setAuthError] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    if (!supabase) return
    let live = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (live) { setSession(next); setReady(true) }
      if (_event === 'SIGNED_OUT') Object.keys(sessionStorage).filter(k => k.startsWith('bizbridge.pending.')).forEach(k => sessionStorage.removeItem(k))
    })
    supabase.auth.getSession().then(({ data, error }) => { if (live) { setSession(data.session); setReady(true); if (error) setAuthError('Your session could not be loaded. Please sign in again.') } }).catch(() => { if (live) { setReady(true); setAuthError('Could not connect to authentication. Please try again.') } })
    return () => { live = false; subscription.unsubscribe() }
  }, [])
  if (!ready) return <div className="loading-screen"><Brand /><p>Checking your secure session…</p></div>
  if (!session && !demo) return <Welcome error={authError} onDemo={() => { sessionStorage.setItem('bizbridge.preview', 'true'); setDemo(true); navigate('/dashboard') }} />
  return <WorkspaceProvider key={demo ? 'demo' : session!.user.id} demo={demo} session={session} onLogout={() => { setDemo(false); setSession(null); navigate('/') }}><Shell /></WorkspaceProvider>
}
function Welcome({ onDemo, error }: { onDemo: () => void; error: string }) {
  const [signUp, setSignUp] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failure, setFailure] = useState(error)
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase || busy) return
    const fd = new FormData(e.currentTarget); setBusy(true); setFailure(''); setMessage('')
    try {
      const email = String(fd.get('email')).trim(), password = String(fd.get('password'))
      const result = signUp ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + '/dashboard' } }) : await supabase.auth.signInWithPassword({ email, password })
      if (result.error) throw result.error
      if (signUp && !result.data.session) setMessage('Check your email for a confirmation link. After confirming your address, return here and sign in. If no email arrives, check spam or try signing in if you already have an account.')
    } catch (e) { setFailure(e instanceof Error ? e.message : 'Authentication failed. Please try again.') } finally { setBusy(false) }
  }
  return <div className="welcome"><section className="welcome-story"><Brand /><div className="welcome-copy"><span className="eyebrow">SMALL BUSINESS. CLEARER DIRECTION.</span><h1>Know your numbers.<br /><em>Grow your business.</em></h1><p>Your products, sales and everyday expenses, brought together in one practical workspace.</p><div className="welcome-path"><span><Boxes />Keep track of your stock</span><span><BarChart3 />Understand what you earn</span><span><Compass />Find your next useful step</span></div></div><p className="welcome-footer">Made for South African entrepreneurs.<br />Built by SeTshedi Innovations</p></section>
    <section className="welcome-entry"><div className="entry-card"><div className="welcome-help"><BizBridgeHelper /></div><span className="eyebrow">WELCOME TO BIZBRIDGE SA</span><h2>{signUp ? 'Start with a clear picture.' : 'Your business, in focus.'}</h2><p>{configured ? 'Sign in to your private business workspace.' : 'Explore the working app with an illustrative detergent business.'}</p>
      {failure && <Notice kind="error">{failure}</Notice>}{message && <Notice kind="success">{message}</Notice>}
      {configured ? <><form onSubmit={authenticate}><Field label="Email address"><input type="email" name="email" autoComplete="email" required maxLength={254} /></Field><Field label="Password" hint={signUp ? 'At least 8 characters. Use a unique password.' : undefined}><input type="password" name="password" minLength={8} autoComplete={signUp ? 'new-password' : 'current-password'} required /></Field><button type="submit" className="btn primary full" disabled={busy}>{busy ? 'Please wait…' : signUp ? 'Create account' : 'Sign in'}<ArrowRight size={18} /></button></form><button className="text-button" onClick={() => { setSignUp(!signUp); setFailure(''); setMessage('') }}>{signUp ? 'Already have an account? Sign in' : 'New here? Create an account'}</button><div className="divider">or explore first</div></> : <Notice>{partialConfig ? 'Supabase configuration is incomplete. Check both environment values in .env.local.' : 'Real accounts need a Supabase connection. The sample preview is ready to explore.'}</Notice>}
      <button className={`btn ${configured ? 'secondary' : 'primary'} full`} onClick={onDemo}>Explore demo<ArrowRight size={18} /></button><p className="fine-print">DEMO MODE — fictional data stored on this device.<br />All sample prices, costs and transactions are illustrative. This preview does not sign you in.</p><button className="text-button muted" onClick={() => { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(sampleWorkspace())); setMessage('Demo reset to the illustrative sample. Choose Explore demo to open it.') }}>Reset demo sample</button>
      <div className="privacy-note"><ShieldCheck size={20} /><span>No identity documents, bank details or payment-card information needed.</span></div>
    </div></section></div>
}
const links = [
  { to: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }, { to: 'products', label: 'Products', icon: Boxes },
  { to: 'sales', label: 'Sales', icon: ShoppingBag }, { to: 'expenses', label: 'Expenses', icon: Receipt },
  { to: 'money', label: 'Money Split', icon: Wallet },
  { to: 'growth', label: 'Growth Guide', icon: Compass }, { to: 'settings', label: 'Settings', icon: Settings },
]
function Shell() {
  const { data, loading, error, demo, logout, refresh } = useWorkspace()
  const [menu, setMenu] = useState(false), [help, setHelp] = useState(false)
  const navigate = useNavigate()
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to main content</a>
    {menu && <button aria-label="Close navigation" className="nav-scrim" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? 'is-open' : ''}`}><Brand /><div className="workspace-label">YOUR WORKSPACE</div><nav aria-label="Main navigation">{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={`/${to}`} onClick={() => setMenu(false)}><Icon size={20} /><span>{label}</span>{to === 'growth' && <span className="nav-dot" />}</NavLink>)}</nav><div className="sidebar-bottom"><div className="sidebar-tip"><span className="tip-icon"><Compass size={22} /></span><h3>Small steps. Real progress.</h3><p>Turn better records into your next business move.</p><button onClick={() => { navigate('/growth'); setMenu(false) }}>Open Growth Guide <ArrowRight size={15} /></button></div><button className="logout" onClick={() => void logout()}><LogOut size={18} />{demo ? 'Leave demo' : 'Log out'}</button><div className="sidebar-credit">Built by<br /><strong>SeTshedi Innovations</strong></div></div></aside>
    <div className="app-content"><header className="topbar"><div className="mobile-brand"><button className="icon-button" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu /></button><Brand /></div><div className="business-label"><span className="business-avatar">{(data.business?.name || 'B').slice(0, 1)}</span><div><strong>{data.business?.name || 'Your new business'}</strong><span>{demo ? 'Illustrative business workspace' : 'Private business workspace'}</span></div></div><div className="topbar-tools"><WorkspaceHelper /><span className={`mode-chip ${demo ? '' : 'live'}`}><span />{demo ? 'Demo workspace' : 'Supabase connected'}</span><button className="icon-button" aria-label="About this app" onClick={() => setHelp(!help)}>{help ? <X size={21} /> : <CircleHelp size={21} />}</button></div></header>
    {demo && <div className="demo-banner"><span><b>DEMO MODE</b> — fictional data stored on this device.</span><span>All sample values are illustrative.</span></div>}
    <main id="main-content" tabIndex={-1}>
      {help && <Notice>BizBridge SA helps you keep product, sales and operating expense records. Payments are not processed. A business profile is not company registration. This prototype is not a complete accounting or tax system.</Notice>}
      {loading ? <div className="loading-screen" role="status"><span className="loader" /><h2>Opening your workspace…</h2><p>Loading saved business records.</p></div> : error ? <div className="error-panel"><Notice kind="error">Could not load your workspace: {error}. No switch to demo was made.</Notice><button className="btn primary" onClick={() => void refresh()}>Try loading again</button></div> : !data.business ? <section className="onboarding"><span className="eyebrow">YOUR FIRST STEP</span><h1>Let’s meet your business.</h1><p>Create a simple profile, then add your first product.</p><div className="panel"><ProfileForm onSaved={() => navigate('/products')} /><Notice>Creating this profile is not official company registration.</Notice></div></section> : <Routes><Route path="/dashboard" element={<Dashboard />} /><Route path="/products" element={<Products />} /><Route path="/sales" element={<Sales />} /><Route path="/expenses" element={<Expenses />} /><Route path="/money" element={<MoneySplit />} /><Route path="/growth" element={<GrowthGuide />} /><Route path="/settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes>}
      <footer className="page-footer"><span>BizBridge SA · Know your numbers. Grow your business.</span><span>Built by <strong>SeTshedi Innovations</strong></span></footer>
    </main></div></div>
}
