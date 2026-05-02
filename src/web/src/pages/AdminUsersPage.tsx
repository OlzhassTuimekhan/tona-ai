import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createUser, deleteUser, listUsers, type AuthUser } from '@/api/client'
import { ROLE_OPTIONS_ADMIN } from '@/constants/roles'
import { useAuth } from '@/context/AuthContext'

export default function AdminUsersPage() {
  const { t } = useTranslation()
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

  const roleLabel = useCallback(
    (value: string) => {
      const key = `role.${value}` as const
      const tr = t(key)
      return tr === key ? value : tr
    },
    [t],
  )

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
        <h2 className="panel-title">{t('admin.title')}</h2>
        <button type="button" className="btn-secondary" disabled={adminBusy} onClick={() => void loadAdminUsers()}>
          {t('admin.refresh')}
        </button>
      </div>
      <div className="admin-create-form">
        <h3 className="subh">{t('admin.createTitle')}</h3>
        <div className="admin-form-grid admin-form-grid--two">
          <label className="field">
            <span>{t('admin.username')}</span>
            <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('admin.password')}</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('admin.role')}</span>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {ROLE_OPTIONS_ADMIN.map((o) => (
                <option key={o.value} value={o.value}>
                  {roleLabel(o.value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('admin.org')}</span>
            <input
              type="text"
              value={newOrg}
              onChange={(e) => setNewOrg(e.target.value)}
              placeholder={t('admin.orgPh')}
            />
          </label>
          <label className="field">
            <span>{t('admin.city')}</span>
            <input type="text" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('admin.region')}</span>
            <input type="text" value={newRegion} onChange={(e) => setNewRegion(e.target.value)} />
          </label>
        </div>
        <button
          type="button"
          disabled={adminBusy || !newUsername || !newPassword}
          onClick={() => void handleCreateUser()}
        >
          {adminBusy ? t('admin.creating') : t('admin.create')}
        </button>
      </div>
      {adminUsersList.length > 0 ? (
        <table className="data-table" style={{ marginTop: '1.5rem' }}>
          <thead>
            <tr>
              <th>{t('admin.thLogin')}</th>
              <th>{t('admin.thRole')}</th>
              <th>{t('admin.thOrg')}</th>
              <th>{t('admin.thCity')}</th>
              <th>{t('admin.thRegion')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {adminUsersList.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>
                  <span className={`role-badge role-${u.role}`} title={roleLabel(u.role)}>
                    {roleLabel(u.role)}
                  </span>
                </td>
                <td>{u.org || t('common.dash')}</td>
                <td>{u.city || t('common.dash')}</td>
                <td>{u.region || t('common.dash')}</td>
                <td>
                  {u.id !== authUser?.id ? (
                    <button
                      type="button"
                      className="btn-link"
                      style={{ color: 'var(--error)' }}
                      onClick={() => void handleDeleteUser(u.id)}
                    >
                      {t('common.delete')}
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
