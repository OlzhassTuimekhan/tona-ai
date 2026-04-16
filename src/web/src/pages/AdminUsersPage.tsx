import { useCallback, useEffect, useState } from 'react'
import { createUser, deleteUser, listUsers, type AuthUser } from '@/api/client'
import { ROLE_OPTIONS_ADMIN } from '@/constants/roles'
import { useAuth } from '@/context/AuthContext'

export default function AdminUsersPage() {
  const { user: authUser } = useAuth()
  const [adminUsersList, setAdminUsersList] = useState<AuthUser[]>([])
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminErr, setAdminErr] = useState<string | null>(null)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('akim')
  const [newOrg, setNewOrg] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newRegion, setNewRegion] = useState('')

  const loadAdminUsers = useCallback(async () => {
    setAdminBusy(true)
    setAdminErr(null)
    try {
      setAdminUsersList(await listUsers())
    } catch (e) {
      setAdminErr(String(e))
    } finally {
      setAdminBusy(false)
    }
  }, [])

  useEffect(() => {
    void loadAdminUsers()
  }, [loadAdminUsers])

  const handleCreateUser = async () => {
    setAdminErr(null)
    setAdminBusy(true)
    try {
      await createUser({
        username: newUsername,
        password: newPassword,
        role: newRole,
        org: newOrg || undefined,
        city: newCity || undefined,
        region: newRegion || undefined,
      })
      setNewUsername('')
      setNewPassword('')
      setNewOrg('')
      setNewCity('')
      setNewRegion('')
      await loadAdminUsers()
    } catch (e) {
      setAdminErr(String(e))
    } finally {
      setAdminBusy(false)
    }
  }

  const handleDeleteUser = async (id: string) => {
    setAdminErr(null)
    try {
      await deleteUser(id)
      await loadAdminUsers()
    } catch (e) {
      setAdminErr(String(e))
    }
  }

  return (
    <section className="panel">
      {adminErr ? <p className="error panel-inline-err">{adminErr}</p> : null}
      <div className="row space-between">
        <h2 className="panel-title">Управление пользователями</h2>
        <button type="button" className="btn-secondary" disabled={adminBusy} onClick={() => void loadAdminUsers()}>
          Обновить
        </button>
      </div>
      <div className="admin-create-form">
        <h3 className="subh">Создать пользователя (операторы и админ)</h3>
        <div className="admin-form-grid admin-form-grid--two">
          <label className="field">
            <span>Логин</span>
            <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>Роль</span>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {ROLE_OPTIONS_ADMIN.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Организация</span>
            <input
              type="text"
              value={newOrg}
              onChange={(e) => setNewOrg(e.target.value)}
              placeholder="Акимат г. …"
            />
          </label>
          <label className="field">
            <span>Город</span>
            <input type="text" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
          </label>
          <label className="field">
            <span>Регион</span>
            <input type="text" value={newRegion} onChange={(e) => setNewRegion(e.target.value)} />
          </label>
        </div>
        <button
          type="button"
          disabled={adminBusy || !newUsername || !newPassword}
          onClick={() => void handleCreateUser()}
        >
          {adminBusy ? 'Создание…' : 'Создать'}
        </button>
      </div>
      {adminUsersList.length > 0 ? (
        <table className="data-table" style={{ marginTop: '1.5rem' }}>
          <thead>
            <tr>
              <th>Логин</th>
              <th>Роль</th>
              <th>Организация</th>
              <th>Город</th>
              <th>Регион</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {adminUsersList.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>
                  <span className={`role-badge role-${u.role}`} title={u.role}>
                    {u.role_label_ru ?? u.role}
                  </span>
                </td>
                <td>{u.org || '—'}</td>
                <td>{u.city || '—'}</td>
                <td>{u.region || '—'}</td>
                <td>
                  {u.id !== authUser?.id ? (
                    <button
                      type="button"
                      className="btn-link"
                      style={{ color: 'var(--error)' }}
                      onClick={() => void handleDeleteUser(u.id)}
                    >
                      Удалить
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  )
}
