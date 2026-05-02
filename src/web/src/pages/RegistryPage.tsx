import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { listRegistrySessions, type RegistrySessionRow } from '@/api/client'
import { useAuth } from '@/context/AuthContext'

const REGISTRY_NO_ORG = '__REGISTRY_NO_ORG__'

export default function RegistryPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [sessions, setSessions] = useState<RegistrySessionRow[]>([])
  const [regErr, setRegErr] = useState<string | null>(null)
  const [regBusy, setRegBusy] = useState(false)
  const [archiveOrg, setArchiveOrg] = useState('')

  const orgTabLabel = useMemo(
    () => (key: string) => (key === REGISTRY_NO_ORG ? t('registry.noOrg') : key),
    [t],
  )

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
      const key = s.public_org?.trim() || REGISTRY_NO_ORG
      ;(orgGroups[key] ??= []).push(s)
    }
  }
  const orgNames = Object.keys(orgGroups).sort((a, b) =>
    a === REGISTRY_NO_ORG ? 1 : b === REGISTRY_NO_ORG ? -1 : a.localeCompare(b),
  )
  const visibleSessions =
    isAdmin && archiveOrg
      ? sessions.filter((s) => (s.public_org?.trim() || REGISTRY_NO_ORG) === archiveOrg)
      : sessions

  return (
    <section className="panel">
      {regErr ? <p className="error panel-inline-err">{regErr}</p> : null}
      <div className="row space-between">
        <h2 className="panel-title">{t('registry.title')}</h2>
        <button type="button" disabled={regBusy} onClick={() => void loadRegistry()}>
          {t('common.refresh')}
        </button>
      </div>

      {isAdmin && orgNames.length > 1 ? (
        <div className="archive-org-nav">
          <button
            type="button"
            className={!archiveOrg ? 'org-tab org-tab-active' : 'org-tab'}
            onClick={() => setArchiveOrg('')}
          >
            {t('registry.allTab', { count: sessions.length })}
          </button>
          {orgNames.map((org) => (
            <button
              key={org}
              type="button"
              className={archiveOrg === org ? 'org-tab org-tab-active' : 'org-tab'}
              onClick={() => setArchiveOrg(org)}
            >
              {orgTabLabel(org)} ({orgGroups[org].length})
            </button>
          ))}
        </div>
      ) : null}

      {regBusy && sessions.length === 0 ? (
        <p className="muted">{t('registry.loading')}</p>
      ) : visibleSessions.length === 0 ? (
        <p className="muted">
          {archiveOrg
            ? t('registry.emptyFiltered', { org: orgTabLabel(archiveOrg) })
            : t('registry.empty')}
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('registry.date')}</th>
              <th>{t('registry.titleCol')}</th>
              {isAdmin && !archiveOrg ? <th>{t('registry.org')}</th> : null}
              <th>{t('registry.profile')}</th>
              <th>{t('registry.quotesCol')}</th>
              <th>{t('registry.published')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleSessions.map((s) => (
              <tr key={s.id}>
                <td className="nowrap">{new Date(s.created_at).toLocaleDateString()}</td>
                <td>{s.title}</td>
                {isAdmin && !archiveOrg ? (
                  <td className="small">{s.public_org || t('common.dash')}</td>
                ) : null}
                <td>{s.analysis_type}</td>
                <td>
                  {s.commitments_verified_quotes}/{s.commitments_total}
                </td>
                <td>
                  {s.published ? (
                    <span className="badge ok">{t('registry.yes')}</span>
                  ) : (
                    <span className="badge muted-badge">{t('registry.no')}</span>
                  )}
                </td>
                <td>
                  <Link to={`/registry/${s.id}`} className="btn-link">
                    {t('common.open')}
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
