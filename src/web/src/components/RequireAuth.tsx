import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { canAccessAnalyzeAndRegistry } from '@/constants/roles'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) {
    return <div className="auth-loading">Загрузка…</div>
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  }
  return <>{children}</>
}

export function RequireAkim({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <div className="auth-loading">Загрузка…</div>
  }
  if (!user || !canAccessAnalyzeAndRegistry(user.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <div className="auth-loading">Загрузка…</div>
  }
  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
