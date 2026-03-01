import { FormEvent, useEffect, useRef, useState } from 'react'
import { BarChart3, CalendarDays, ChevronDown, KeyRound, Layers3, ListChecks, LogOut, Package, PanelLeftClose, PanelLeftOpen, UserRound, Users, UsersRound } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import CustomersPage from './pages/CustomersPage'
import ProductsPage from './pages/ProductsPage'
import MaterialGroupsPage from './pages/MaterialGroupsPage'
import UnitWeightOptionsPage from './pages/UnitWeightOptionsPage'
import ItemsPage from './pages/ItemsPage'
import ProductionPlanPage from './pages/ProductionPlanPage'
import UserManagementPage from './pages/UserManagementPage'
import StatisticsPage from './pages/StatisticsPage'
import { api } from './lib/api'
import { AppUser, ProductionPlan } from './types'
import { Lang, t } from './lib/i18n'

type ToastType = 'success' | 'error'
type ToastItem = { id: number; message: string; type: ToastType }

type LoginResponse = { token: string; user: AppUser }

const MAIN_ROUTES = ['/stats', '/customers', '/products', '/material-groups', '/unit-weight-options', '/items', '/plans']

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname
  const isProductDetailRoute = /^\/products\/\d+$/.test(pathname)

  const [token, setToken] = useState<string>(localStorage.getItem('token') || '')
  const [lang, setLang] = useState<Lang>((localStorage.getItem('lang') as Lang) || 'vi')
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(localStorage.getItem('sidebar_collapsed') === '1')
  const [materialMenuOpen, setMaterialMenuOpen] = useState(true)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('123456')
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [me, setMe] = useState<AppUser | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [nearEtdPlanCount, setNearEtdPlanCount] = useState(0)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const [accountForm, setAccountForm] = useState({ full_name: '', avatar_url: '', role: 'staff' as AppUser['role'] })
  const [passForm, setPassForm] = useState({ current_password: '', new_password: '' })

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
      setMe(null)
    }
  }, [token])

  useEffect(() => {
    localStorage.setItem('lang', lang)
  }, [lang])

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    if (!token) {
      if (pathname !== '/login') {
        navigate('/login', { replace: true })
      }
      return
    }

    const isAllowed = MAIN_ROUTES.includes(pathname) || isProductDetailRoute || pathname === '/account' || pathname === '/users'
    if (!isAllowed || pathname === '/login' || pathname === '/') {
      navigate('/customers', { replace: true })
    }
  }, [token, pathname, navigate])

  const loadMe = async (accessToken: string) => {
    const profile = await api<AppUser>('/api/auth/me', 'GET', undefined, accessToken)
    setMe(profile)
    setAccountForm({
      full_name: profile.full_name || '',
      avatar_url: profile.avatar_url || '',
      role: profile.role,
    })
  }

  useEffect(() => {
    if (!token) return
    void loadMe(token).catch(() => {
      setToken('')
      navigate('/login', { replace: true })
    })
  }, [token, navigate])

  useEffect(() => {
    if (!token) {
      setNearEtdPlanCount(0)
      return
    }
    void refreshNearEtdPlanCount()
  }, [token, pathname])

  const pushToast = (message: string, type: ToastType) => {
    const item: ToastItem = { id: Date.now() + Math.floor(Math.random() * 1000), message, type }
    setToasts((prev) => [...prev, item])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== item.id))
    }, 3200)
  }
  const tr = (key: Parameters<typeof t>[1]) => t(lang, key)

  const parseDmyDate = (value?: string) => {
    if (!value) return null
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim())
    if (!m) return null
    const d = Number(m[1])
    const mo = Number(m[2]) - 1
    const y = Number(m[3])
    const dt = new Date(y, mo, d)
    if (Number.isNaN(dt.getTime())) return null
    return dt
  }

  const isEtdWithin5Days = (value?: string) => {
    const etdDate = parseDmyDate(value)
    if (!etdDate) return false
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffDays = Math.floor((etdDate.getTime() - today.getTime()) / 86400000)
    return diffDays >= 0 && diffDays <= 5
  }

  const refreshNearEtdPlanCount = async () => {
    if (!token) return
    try {
      const plans = await api<ProductionPlan[]>('/api/production-plans?search=', 'GET', undefined, token)
      setNearEtdPlanCount(plans.filter((p) => isEtdWithin5Days(p.etd)).length)
    } catch {
      setNearEtdPlanCount(0)
    }
  }

  const doLogout = async () => {
    try {
      if (token) {
        await api('/api/auth/logout', 'POST', {}, token)
      }
    } catch {
      // no-op
    }
    setToken('')
    setMenuOpen(false)
    navigate('/login', { replace: true })
    pushToast(tr('logoutSuccess'), 'success')
  }

  const login = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res = await api<LoginResponse>('/api/auth/login', 'POST', { username, password })
      setToken(res.token)
      setMe(res.user)
      setAccountForm({
        full_name: res.user.full_name || '',
        avatar_url: res.user.avatar_url || '',
        role: res.user.role,
      })
      navigate('/customers', { replace: true })
      pushToast(tr('loginSuccess'), 'success')
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      pushToast(message, 'error')
    }
  }

  const saveAccount = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) return
    try {
      const payload: Record<string, unknown> = {
        full_name: accountForm.full_name,
        avatar_url: accountForm.avatar_url,
      }
      if (me?.role === 'admin') {
        payload.role = accountForm.role
      }
      const updated = await api<AppUser>('/api/auth/me/update', 'PUT', payload, token)
      setMe(updated)
      setAccountForm({
        full_name: updated.full_name || '',
        avatar_url: updated.avatar_url || '',
        role: updated.role,
      })
      pushToast(tr('accountUpdated'), 'success')
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) return
    try {
      await api('/api/auth/change-password', 'PUT', passForm, token)
      setPassForm({ current_password: '', new_password: '' })
      pushToast(tr('passwordChanged'), 'success')
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const toastNode = (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast-${item.type}`}>{item.message}</div>
      ))}
    </div>
  )

  if (!token) {
    return (
      <>
        <div className="login-page">
          <div className="login-bg-glow login-bg-glow-a" />
          <div className="login-bg-glow login-bg-glow-b" />
          <form className="login-card" onSubmit={login}>
            <div className="login-brand">
              <span className="login-badge">
                <img src="/logo-mpg.svg" alt="MINH PHUONG GROUP" className="brand-logo-small" />
                MINH PHUONG GROUP
              </span>
              <h1>{tr('loginTitle')}</h1>
              <p>{tr('loginDesc')}</p>
            </div>
            <label className="login-field">
              <span>
                <UserRound size={14} />
                {tr('username')}
              </span>
              <input placeholder={tr('inputUsername')} value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="login-field">
              <span>
                <KeyRound size={14} />
                {tr('password')}
              </span>
              <input
                type="password"
                placeholder={tr('inputPassword')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error ? <div className="error">{error}</div> : null}
            <button className="primary login-submit" type="submit">{tr('login')}</button>
            <div className="small login-hint">{tr('defaultAccount')}</div>
          </form>
        </div>
        {toastNode}
      </>
    )
  }

  const avatarFallback = (me?.full_name || me?.username || 'U').slice(0, 1).toUpperCase()
  const isProductsSection = pathname.startsWith('/products')
  const isMaterialSection = pathname === '/material-groups' || pathname === '/unit-weight-options'

  return (
    <>
      <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="top-navbar">
          <div className="navbar-left">
            <button
              type="button"
              className="sidebar-toggle-btn"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setSidebarCollapsed((v) => !v)}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
          <div className="header-right">
            <div className="lang-switch">
              <button className={`flag-btn ${lang === 'vi' ? 'active' : ''}`} onClick={() => setLang('vi')} title="Tiếng Việt">🇻🇳</button>
              <button className={`flag-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')} title="English">🇺🇸</button>
            </div>
            <div className="user-menu" ref={menuRef}>
              <button className="user-menu-trigger" type="button" onClick={() => setMenuOpen((v) => !v)}>
                {me?.avatar_url ? <img src={me.avatar_url} className="avatar" alt={me.full_name || me.username} /> : <span className="avatar-fallback">{avatarFallback}</span>}
                <span>{me?.full_name || me?.username}</span>
                <ChevronDown size={16} />
              </button>
              {menuOpen ? (
                <div className="user-menu-dropdown">
                  <button type="button" onClick={() => { navigate('/account'); setMenuOpen(false) }}>
                    <UserRound size={15} /> {tr('menuAccount')}
                  </button>
                  <button type="button" onClick={() => { navigate('/users'); setMenuOpen(false) }}>
                    <UsersRound size={15} /> {tr('menuUsers')}
                  </button>
                  <button type="button" onClick={() => void doLogout()}>
                    <LogOut size={15} /> {tr('menuLogout')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {MAIN_ROUTES.includes(pathname) || isProductDetailRoute ? (
          <div className="main-layout">
            <aside className="sidebar">
              <div className="sidebar-brand">
                <img src="/logo-mpg.svg" alt="MINH PHUONG GROUP" className="sidebar-logo" />
                <div className="sidebar-brand-text">MINH PHUONG GROUP</div>
              </div>
              <nav className="sidebar-nav">
                <button className={`side-btn ${pathname === '/stats' ? 'active' : ''}`} type="button" onClick={() => navigate('/stats')}>
                  <BarChart3 size={15} />
                  <span className="side-label">{tr('tabStats')}</span>
                </button>
                <button className={`side-btn ${pathname === '/customers' ? 'active' : ''}`} type="button" onClick={() => navigate('/customers')}>
                  <Users size={15} />
                  <span className="side-label">{tr('tabCustomers')}</span>
                </button>
                <button className={`side-btn ${isProductsSection ? 'active' : ''}`} type="button" onClick={() => navigate('/products')}>
                  <Package size={15} />
                  <span className="side-label">{tr('tabProducts')}</span>
                </button>
                <button
                  className={`side-btn ${isMaterialSection ? 'active' : ''}`}
                  type="button"
                  onClick={() => {
                    if (sidebarCollapsed) {
                      navigate('/material-groups')
                    } else {
                      setMaterialMenuOpen((v) => !v)
                    }
                  }}
                >
                  <Layers3 size={15} />
                  <span className="side-label">{tr('materialGroup')}</span>
                  <ChevronDown size={14} className={`side-chevron ${materialMenuOpen ? 'open' : ''}`} />
                </button>
                {!sidebarCollapsed && materialMenuOpen ? (
                  <div className="side-submenu">
                    <button className={`side-sub-btn ${pathname === '/material-groups' ? 'active' : ''}`} type="button" onClick={() => navigate('/material-groups')}>
                      {tr('materialGroup')}
                    </button>
                    <button className={`side-sub-btn ${pathname === '/unit-weight-options' ? 'active' : ''}`} type="button" onClick={() => navigate('/unit-weight-options')}>
                      {tr('unitWeightOptions')}
                    </button>
                  </div>
                ) : null}
                <button className={`side-btn ${pathname === '/items' ? 'active' : ''}`} type="button" onClick={() => navigate('/items')}>
                  <ListChecks size={15} />
                  <span className="side-label">{tr('itemList')}</span>
                </button>
                <button className={`side-btn ${pathname === '/plans' ? 'active' : ''}`} type="button" onClick={() => navigate('/plans')}>
                  <CalendarDays size={15} />
                  <span className="side-label">{tr('tabPlans')}</span>
                  {nearEtdPlanCount > 0 ? <span className="side-count-badge">({nearEtdPlanCount})</span> : null}
                </button>
              </nav>
            </aside>
            <div className="content-area">
              {pathname === '/stats' ? <StatisticsPage token={token} notify={pushToast} t={tr} /> : null}
              {pathname === '/customers' ? <CustomersPage token={token} notify={pushToast} t={tr} /> : null}
              {pathname === '/products' || isProductDetailRoute ? <ProductsPage token={token} notify={pushToast} t={tr} /> : null}
              {pathname === '/material-groups' ? <MaterialGroupsPage token={token} notify={pushToast} t={tr} /> : null}
              {pathname === '/unit-weight-options' ? <UnitWeightOptionsPage token={token} notify={pushToast} t={tr} /> : null}
              {pathname === '/items' ? <ItemsPage token={token} notify={pushToast} t={tr} /> : null}
              {pathname === '/plans' ? <ProductionPlanPage token={token} notify={pushToast} t={tr} onPlansChanged={refreshNearEtdPlanCount} /> : null}
            </div>
          </div>
        ) : null}

        {pathname === '/account' ? (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{tr('accountInfo')}</strong>
              <button type="button" onClick={() => navigate('/customers')}>{tr('close')}</button>
            </div>

            <form onSubmit={saveAccount}>
              <div className="grid-2">
                <div className="form-field"><label>{tr('lblFullName')}</label><input placeholder={tr('phFullName')} value={accountForm.full_name} onChange={(e) => setAccountForm({ ...accountForm, full_name: e.target.value })} /></div>
                <div className="form-field"><label>{tr('lblAvatarUrl')}</label><input placeholder={tr('phAvatarUrl')} value={accountForm.avatar_url} onChange={(e) => setAccountForm({ ...accountForm, avatar_url: e.target.value })} /></div>
                <div className="form-field"><label>{tr('colUsername')}</label><input placeholder={tr('colUsername')} value={me?.username || ''} disabled /></div>
                <div className="form-field">
                  <label>{tr('lblRole')}</label>
                  <select
                    value={accountForm.role}
                    disabled={me?.role !== 'admin'}
                    onChange={(e) => setAccountForm({ ...accountForm, role: e.target.value as AppUser['role'] })}
                  >
                    <option value="staff">staff</option>
                    <option value="manager">manager</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </div>
              <div className="row form-actions"><button className="primary" type="submit">{tr('saveInfo')}</button></div>
            </form>

            <form onSubmit={changePassword}>
              <div className="row"><strong>{tr('changePassword')}</strong></div>
              <div className="grid-2">
                <div className="form-field">
                  <label>{tr('currentPassword')}</label>
                  <input
                    type="password"
                    placeholder={tr('phCurrentPassword')}
                    value={passForm.current_password}
                    onChange={(e) => setPassForm({ ...passForm, current_password: e.target.value })}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>{tr('newPassword')}</label>
                  <input
                    type="password"
                    placeholder={tr('phNewPassword')}
                    value={passForm.new_password}
                    onChange={(e) => setPassForm({ ...passForm, new_password: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="row form-actions"><button className="primary" type="submit">{tr('changePassword')}</button></div>
            </form>
          </div>
        ) : null}

        {pathname === '/users' && me ? (
          <>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{tr('userManagement')}</strong>
              <button type="button" onClick={() => navigate('/customers')}>{tr('close')}</button>
            </div>
            <UserManagementPage token={token} notify={pushToast} currentUser={me} t={tr} />
          </>
        ) : null}
      </div>
      {toastNode}
    </>
  )
}
