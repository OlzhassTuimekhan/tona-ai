import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { canAccessAnalyzeAndRegistry } from '@/constants/roles'

export default function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) {
    return <div className="auth-loading">Загрузка…</div>
  }
  if (!user) {
    return <Navigate to="/public" replace />
  }
  if (user.role === 'admin') {
    return <Navigate to="/dashboard" replace />
  }
  if (canAccessAnalyzeAndRegistry(user.role)) {
    return <Navigate to="/analyze" replace />
  }
  return <Navigate to="/public" replace />
}
