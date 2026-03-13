import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { canAccessAnalyzeAndRegistry } from '@/constants/roles'

function navCls({ isActive }: { isActive: boolean }) {
  return 'app-nav-link' + (isActive ? ' active' : '')
}

export default function AppLayout() {
  const { user, loading, logout } = useAuth()
  const loc = useLocation()
  const navigate = useNavigate()
  const isAuthPage = loc.pathname === '/login' || loc.pathname === '/register'

  if (loading) {
    return <div className="auth-loading">Загрузка…</div>
  }

  if (isAuthPage) {
    return (
      <div className="app-root">
        <header className="app-top-guest">
          <NavLink to="/" className="app-brand" style={{ textDecoration: 'none' }}>
            JO<span>IS</span>
          </NavLink>
          <nav>
            <NavLink to="/public" className={navCls}>
              Горожанам
            </NavLink>
            <NavLink to="/ratings" className={navCls}>
              Рейтинг
            </NavLink>
          </nav>
        </header>
        <main className="app-main">
          <div className="shell-wide">
            <Outlet />
          </div>
        </main>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app-root">
        <header className="app-top-guest">
          <NavLink to="/" className="app-brand" style={{ textDecoration: 'none' }}>
            JO<span>IS</span>
          </NavLink>
          <nav>
            <NavLink to="/public" className={navCls}>
              Горожанам
            </NavLink>
            <NavLink to="/ratings" className={navCls}>
              Рейтинг
            </NavLink>
            <NavLink to="/login" className={navCls}>
              Войти
            </NavLink>
            <NavLink to="/register" className={navCls}>
              Регистрация гражданина
            </NavLink>
          </nav>
        </header>
        <main className="app-main">
          <div className="shell-wide">
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
          <div style={{ marginTop: 'auto', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            <span className={`role-pill ${role}`}>{role}</span>
            <div style={{ marginTop: 6 }}>{user.username}</div>
          </div>
          <button
            type="button"
            className="app-nav-link"
            onClick={() => {
              logout()
              navigate('/public')
            }}
          >
            Выйти
          </button>
        </aside>
        <main className="app-main">
          <div className="shell-wide">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
