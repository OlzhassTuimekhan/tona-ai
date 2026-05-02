import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { fetchAdminDashboard, type AdminDashboard } from '@/api/client'

export default function DashboardPage() {
  const { t } = useTranslation()
  const [dashboardData, setDashboardData] = useState<AdminDashboard | null>(null)
  const [dashBusy, setDashBusy] = useState(false)

  const loadDashboard = useCallback(async () => {
    setDashBusy(true)
    try {
      setDashboardData(await fetchAdminDashboard())
    } catch {
      setDashboardData(null)
    } finally {
      setDashBusy(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  if (!dashboardData && dashBusy) {
    return <p className="muted">{t('dashboard.loading')}</p>
  }
  if (!dashboardData) {
    return <p className="muted">{t('dashboard.noData')}</p>
  }

  const tot = dashboardData.totals
  const pctFul = tot.commitments > 0 ? Math.round((tot.fulfilled / tot.commitments) * 100) : 0
  const pctOver = tot.commitments > 0 ? Math.round((tot.overdue / tot.commitments) * 100) : 0
  const pctWork = Math.max(0, 100 - pctFul - pctOver)
  const inProgress = tot.commitments - tot.fulfilled - tot.overdue

  return (
    <section className="dash-page">
      <header className="dash-page-header">
        <div>
          <h2 className="dash-page-title">{t('dashboard.title')}</h2>
          <p className="dash-page-lead">{t('dashboard.lead')}</p>
        </div>
        <button
          type="button"
          className="btn-secondary dash-refresh-btn"
          disabled={dashBusy}
          onClick={() => void loadDashboard()}
        >
          {dashBusy ? t('dashboard.refreshing') : t('dashboard.refresh')}
        </button>
      </header>

      <div className="dash-kpi-row">
        <div className="dash-kpi">
          <span className="dash-kpi-label">{t('dashboard.published')}</span>
          <span className="dash-kpi-num">{tot.published}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">{t('dashboard.sessions')}</span>
          <span className="dash-kpi-num">{tot.sessions}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">{t('dashboard.commitments')}</span>
          <span className="dash-kpi-num">{tot.commitments}</span>
        </div>
        <div className="dash-kpi dash-kpi-good">
          <span className="dash-kpi-label">{t('dashboard.fulfilled')}</span>
          <span className="dash-kpi-num">{tot.fulfilled}</span>
        </div>
        <div className={`dash-kpi ${tot.overdue > 0 ? 'dash-kpi-alert' : ''}`}>
          <span className="dash-kpi-label">{t('dashboard.overdue')}</span>
          <span className="dash-kpi-num">{tot.overdue}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">{t('dashboard.observations')}</span>
          <span className="dash-kpi-num">{tot.observations}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">{t('dashboard.akims')}</span>
          <span className="dash-kpi-num">{tot.akims}</span>
        </div>
        {typeof tot.operators === 'number' ? (
          <div className="dash-kpi">
            <span className="dash-kpi-label">{t('dashboard.operators')}</span>
            <span className="dash-kpi-num">{tot.operators}</span>
          </div>
        ) : null}
        {typeof tot.citizens === 'number' ? (
          <div className="dash-kpi">
            <span className="dash-kpi-label">{t('dashboard.citizens')}</span>
            <span className="dash-kpi-num">{tot.citizens}</span>
          </div>
        ) : null}
      </div>

      {tot.commitments > 0 ? (
        <div className="dash-progress-card">
          <div className="dash-progress-head">
            <h3 className="dash-progress-title">{t('dashboard.progressTitle')}</h3>
            <span className="dash-progress-sub">
              {t('dashboard.progressSub', {
                total: tot.commitments,
                fulfilled: tot.fulfilled,
                overdue: tot.overdue,
                inProgress,
              })}
            </span>
          </div>
          <div className="dash-progress-bar" role="img" aria-label={t('dashboard.progressAria')}>
            <div
              className="dash-progress-fill dash-fill-green"
              style={{ width: `${pctFul}%` }}
              title={`${t('dashboard.fulfilled')}: ${tot.fulfilled} (${pctFul}%)`}
            />
            <div
              className="dash-progress-fill dash-fill-red"
              style={{ width: `${pctOver}%` }}
              title={`${t('dashboard.overdue')}: ${tot.overdue} (${pctOver}%)`}
            />
            <div
              className="dash-progress-fill dash-fill-work"
              style={{ width: `${pctWork}%` }}
              title={`${t('jois.inProgress')}: ${inProgress} (${pctWork}%)`}
            />
          </div>
          <div className="dash-progress-legend">
            <span className="legend-green">
              <span className="dash-legend-dot" />
              {t('dashboard.legendFulfilled', { pct: pctFul })}
            </span>
            <span className="legend-red">
              <span className="dash-legend-dot" />
              {t('dashboard.legendOverdue', { pct: pctOver })}
            </span>
            <span className="legend-work">
              <span className="dash-legend-dot" />
              {t('dashboard.legendWork', { pct: pctWork })}
            </span>
          </div>
        </div>
      ) : null}

      {dashboardData.orgs.length > 0 ? (
        <>
          <h3 className="dash-section-title">{t('dashboard.orgs')}</h3>
          <div className="dash-orgs-grid">
            {dashboardData.orgs.map((o) => {
              const level = o.overdue > 0 ? (o.overdue_pct > 30 ? 'red' : 'yellow') : 'green'
              return (
                <div key={o.org} className={`dash-org-card dash-org-${level}`}>
                  <div className="dash-org-header">
                    <strong className="dash-org-name">{o.org}</strong>
                    {o.city ? <span className="dash-org-city">{o.city}</span> : null}
                  </div>
                  <dl className="dash-org-stats">
                    <div className="dash-org-stat">
                      <dt>{t('dashboard.orgSessions')}</dt>
                      <dd>{o.sessions}</dd>
                    </div>
                    <div className="dash-org-stat">
                      <dt>{t('dashboard.orgCommitments')}</dt>
                      <dd>{o.commitments}</dd>
                    </div>
                    <div className="dash-org-stat dash-org-stat--ok">
                      <dt>{t('dashboard.orgFulfilled')}</dt>
                      <dd>
                        {o.fulfilled}{' '}
                        <span className="dash-org-pct">({o.fulfillment_pct}%)</span>
                      </dd>
                    </div>
                    {o.overdue > 0 ? (
                      <div className="dash-org-stat dash-org-stat--bad">
                        <dt>{t('dashboard.orgOverdue')}</dt>
                        <dd>
                          {o.overdue}{' '}
                          <span className="dash-org-pct">({o.overdue_pct}%)</span>
                        </dd>
                      </div>
                    ) : null}
                    <div className="dash-org-stat">
                      <dt>{t('dashboard.orgObs')}</dt>
                      <dd>{o.observations}</dd>
                    </div>
                  </dl>
                  <div className="dash-org-bar-wrap">
                    <span className="dash-org-bar-label">{t('dashboard.orgBar')}</span>
                    <div className="dash-org-bar">
                      <div className="dash-org-fill-ok" style={{ width: `${o.fulfillment_pct}%` }} />
                      <div className="dash-org-fill-bad" style={{ width: `${o.overdue_pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : null}

      {dashboardData.overdue_items.length > 0 ? (
        <>
          <h3 className="dash-section-title">{t('dashboard.overdueSection')}</h3>
          <div className="dash-table-wrap">
            <table className="data-table dash-table">
              <thead>
                <tr>
                  <th>{t('dashboard.thOrg')}</th>
                  <th>{t('dashboard.thSession')}</th>
                  <th>{t('dashboard.thCommitment')}</th>
                  <th>{t('dashboard.thResponsible')}</th>
                  <th>{t('dashboard.thDeadline')}</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.overdue_items.map((item, i) => (
                  <tr key={i} className="row-overdue">
                    <td className="small">{item.org}</td>
                    <td>
                      <Link to={`/registry/${item.session_id}`} className="btn-link">
                        {item.session_title || item.session_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>{item.description}</td>
                    <td className="small">{item.responsible || t('common.dash')}</td>
                    <td className="small nowrap">{item.deadline || t('common.dash')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}
