import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useAuth } from '@/context/AuthContext'
import { canAccessAnalyzeAndRegistry } from '@/constants/roles'

function navCls({ isActive }: { isActive: boolean }) {
  return 'app-nav-link' + (isActive ? ' active' : '')
}

function navClsEgov({ isActive }: { isActive: boolean }) {
  return 'egov-nav-link' + (isActive ? ' active' : '')
}

function GuestHeader() {
  const { t } = useTranslation()

  return (
    <header className="app-top-guest app-top-egov">
      <div className="egov-header-top">
        <NavLink to="/" className="app-brand app-brand-egov" style={{ textDecoration: 'none' }}>
          JO<span>IS</span>
        </NavLink>
        <div className="egov-header-top-right">
          <LanguageSwitcher className="language-switcher--guest" compact />
          <NavLink to="/login" className="egov-link-muted">
            {t('nav.login')}
          </NavLink>
          <NavLink to="/register" className="egov-btn-outline">
            {t('nav.registerCitizen')}
          </NavLink>
        </div>
      </div>
      <nav className="egov-nav-strip" aria-label={t('common.mainNav')}>
        <NavLink to="/public" className={navClsEgov}>
          {t('nav.citizens')}
        </NavLink>
        <NavLink to="/ratings" className={navClsEgov}>
          {t('nav.ratings')}
        </NavLink>
      </nav>
    </header>
  )
}

export default function AppLayout() {
  const { t } = useTranslation()
  const { user, loading, logout } = useAuth()
  const loc = useLocation()
  const navigate = useNavigate()
  const isAuthPage = loc.pathname === '/login' || loc.pathname === '/register'

  const p = loc.pathname
  const shellCls =
    p === '/public' ||
    p === '/ratings' ||
    p === '/dashboard' ||
    p === '/analyze' ||
    p === '/registry' ||
    p.startsWith('/registry/')
      ? 'shell-fluid'
      : p.startsWith('/public/')
        ? 'shell-fluid shell-detail-page'
        : 'shell-wide'

  if (loading) {
    return <div className="auth-loading">{t('auth.loading')}</div>
  }

  if (isAuthPage) {
    return (
      <div className="app-root">
        <GuestHeader />
        <main className="app-main">
          <div className={shellCls}>
            <Outlet />
          </div>
        </main>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app-root">
        <GuestHeader />
        <main className="app-main">
          <div className={shellCls}>
            <Outlet />
          </div>
        </main>
      </div>
    )
  }

  const role = user.role
  const isAdmin = role === 'admin'
  const isStaffOperator = canAccessAnalyzeAndRegistry(role)

  return (
    <div className="app-root">
      <div className="app-body">
        <aside className="app-sidebar">
          <div className="app-sidebar-scroll">
            <NavLink to="/" className="app-brand" style={{ textDecoration: 'none' }}>
              JO<span>IS</span>
            </NavLink>
            {isAdmin ? (
              <NavLink to="/dashboard" className={navCls}>
                {t('nav.dashboard')}
              </NavLink>
            ) : null}
            {isStaffOperator ? (
              <>
                <NavLink to="/analyze" className={navCls}>
                  {t('nav.record')}
                </NavLink>
                <NavLink to="/registry" className={navCls}>
                  {t('nav.archive')}
                </NavLink>
              </>
            ) : null}
            <NavLink to="/public" className={navCls}>
              {t('nav.citizens')}
            </NavLink>
            <NavLink to="/ratings" className={navCls}>
              {t('nav.ratings')}
            </NavLink>
            {isAdmin ? (
              <NavLink to="/admin/users" className={navCls}>
                {t('nav.users')}
              </NavLink>
            ) : null}
            <NavLink to="/profile" className={navCls}>
              {t('nav.profile')}
            </NavLink>
          </div>
          <div className="app-sidebar-lang">
            <LanguageSwitcher />
          </div>
          <div className="app-sidebar-footer">
            <div className="app-sidebar-user">
              <span className={`role-pill ${role}`}>{role}</span>
              <div className="app-sidebar-username">{user.username}</div>
            </div>
            <button
              type="button"
              className="app-nav-link app-sidebar-logout"
              onClick={() => {
                logout()
                navigate('/public')
              }}
            >
              {t('nav.logout')}
            </button>
          </div>
        </aside>
        <main className="app-main">
          <div className={shellCls}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
