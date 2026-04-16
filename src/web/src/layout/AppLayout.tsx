import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { canAccessAnalyzeAndRegistry } from '@/constants/roles'

function navCls({ isActive }: { isActive: boolean }) {
  return 'app-nav-link' + (isActive ? ' active' : '')
}

function navClsEgov({ isActive }: { isActive: boolean }) {
  return 'egov-nav-link' + (isActive ? ' active' : '')
}

function GuestHeader() {
  return (
    <header className="app-top-guest app-top-egov">
      <div className="egov-header-top">
        <NavLink to="/" className="app-brand app-brand-egov" style={{ textDecoration: 'none' }}>
          JO<span>IS</span>
        </NavLink>
        <div className="egov-header-top-right">
          <NavLink to="/login" className="egov-link-muted">
            Войти
          </NavLink>
          <NavLink to="/register" className="egov-btn-outline">
            Регистрация гражданина
          </NavLink>
        </div>
      </div>
      <nav className="egov-nav-strip" aria-label="Основное меню">
        <NavLink to="/public" className={navClsEgov}>
          Горожанам
        </NavLink>
        <NavLink to="/ratings" className={navClsEgov}>
          Рейтинг
        </NavLink>
      </nav>
    </header>
  )
}

export default function AppLayout() {
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
    return <div className="auth-loading">Загрузка…</div>
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
                Дашборд
              </NavLink>
            ) : null}
            {isStaffOperator ? (
              <>
                <NavLink to="/analyze" className={navCls}>
                  Запись
                </NavLink>
                <NavLink to="/registry" className={navCls}>
                  Архив
                </NavLink>
              </>
            ) : null}
            <NavLink to="/public" className={navCls}>
              Горожанам
            </NavLink>
            <NavLink to="/ratings" className={navCls}>
              Рейтинг
            </NavLink>
            {isAdmin ? (
              <NavLink to="/admin/users" className={navCls}>
                Пользователи
              </NavLink>
            ) : null}
            <NavLink to="/profile" className={navCls}>
              Профиль
            </NavLink>
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
              Выйти
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
