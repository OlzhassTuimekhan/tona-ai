import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRegistrySessions, type RegistrySessionRow } from '@/api/client'
import { useAuth } from '@/context/AuthContext'

export default function RegistryPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [sessions, setSessions] = useState<RegistrySessionRow[]>([])
  const [regErr, setRegErr] = useState<string | null>(null)
  const [regBusy, setRegBusy] = useState(false)
  const [archiveOrg, setArchiveOrg] = useState('')

  const loadRegistry = useCallback(async () => {
    setRegErr(null)
    setRegBusy(true)
    try {
      setSessions(await listRegistrySessions())
    } catch (e) {
      setRegErr(String(e))
    } finally {
      setRegBusy(false)
    }
  }, [])

  useEffect(() => {
    void loadRegistry()
  }, [loadRegistry])

  const orgGroups: Record<string, typeof sessions> = {}
  if (isAdmin) {
    for (const s of sessions) {
      const key = s.public_org || 'Без организации'
      ;(orgGroups[key] ??= []).push(s)
    }
  }
  const orgNames = Object.keys(orgGroups).sort((a, b) =>
    a === 'Без организации' ? 1 : b === 'Без организации' ? -1 : a.localeCompare(b),
  )
  const visibleSessions =
    isAdmin && archiveOrg
      ? sessions.filter((s) => (s.public_org || 'Без организации') === archiveOrg)
      : sessions

  return (
    <section className="panel">
      {regErr ? <p className="error panel-inline-err">{regErr}</p> : null}
      <div className="row space-between">
        <h2 className="panel-title">Сохранённые карточки</h2>
        <button type="button" disabled={regBusy} onClick={() => void loadRegistry()}>
          Обновить
        </button>
      </div>

      {isAdmin && orgNames.length > 1 ? (
        <div className="archive-org-nav">
          <button
            type="button"
            className={!archiveOrg ? 'org-tab org-tab-active' : 'org-tab'}
            onClick={() => setArchiveOrg('')}
          >
            Все ({sessions.length})
          </button>
          {orgNames.map((org) => (
            <button
              key={org}
              type="button"
              className={archiveOrg === org ? 'org-tab org-tab-active' : 'org-tab'}
              onClick={() => setArchiveOrg(org)}
            >
              {org} ({orgGroups[org].length})
            </button>
          ))}
        </div>
      ) : null}

      {regBusy && sessions.length === 0 ? (
        <p className="muted">Загрузка…</p>
      ) : visibleSessions.length === 0 ? (
        <p className="muted">
          {archiveOrg
            ? `Нет карточек для «${archiveOrg}».`
            : 'Пока пусто. Завершите разбор на вкладке «Запись» и нажмите «В реестр».'}
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Заголовок</th>
              {isAdmin && !archiveOrg ? <th>Организация</th> : null}
              <th>Профиль</th>
              <th>Поручения (✓ цитата)</th>
              <th>Опубликовано</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleSessions.map((s) => (
              <tr key={s.id}>
                <td className="nowrap">{new Date(s.created_at).toLocaleDateString()}</td>
                <td>{s.title}</td>
                {isAdmin && !archiveOrg ? <td className="small">{s.public_org || '—'}</td> : null}
                <td>{s.analysis_type}</td>
                <td>
                  {s.commitments_verified_quotes}/{s.commitments_total}
                </td>
                <td>
                  {s.published ? (
                    <span className="badge ok">да</span>
                  ) : (
                    <span className="badge muted-badge">нет</span>
                  )}
                </td>
                <td>
                  <Link to={`/registry/${s.id}`} className="btn-link">
                    Открыть
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
