import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAdmin, RequireAkim, RequireAuth } from '@/components/RequireAuth'
import AppLayout from '@/layout/AppLayout'
import AdminUsersPage from '@/pages/AdminUsersPage'
import AnalyzePage from '@/pages/AnalyzePage'
import DashboardPage from '@/pages/DashboardPage'
import HomeRedirect from '@/pages/HomeRedirect'
import LoginPage from '@/pages/LoginPage'
import ProfilePage from '@/pages/ProfilePage'
import PublicDetailPage from '@/pages/PublicDetailPage'
import PublicListPage from '@/pages/PublicListPage'
import RatingsPage from '@/pages/RatingsPage'
import RegisterPage from '@/pages/RegisterPage'
import RegistryPage from '@/pages/RegistryPage'
import SessionDetailPage from '@/pages/SessionDetailPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomeRedirect />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="public" element={<PublicListPage />} />
        <Route path="public/:id" element={<PublicDetailPage />} />
        <Route path="ratings" element={<RatingsPage />} />
        <Route
          path="profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="dashboard"
          element={
            <RequireAdmin>
              <DashboardPage />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/users"
          element={
            <RequireAdmin>
              <AdminUsersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="analyze"
          element={
            <RequireAkim>
              <AnalyzePage />
            </RequireAkim>
          }
        />
        <Route
          path="registry"
          element={
            <RequireAkim>
              <RegistryPage />
            </RequireAkim>
          }
        />
        <Route
          path="registry/:id"
          element={
            <RequireAkim>
              <SessionDetailPage />
            </RequireAkim>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
