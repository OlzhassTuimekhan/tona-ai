import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAdminDashboard, type AdminDashboard } from '@/api/client'

export default function DashboardPage() {
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
    return <p className="muted">Загрузка…</p>
  }
  if (!dashboardData) {
    return <p className="muted">Нет данных</p>
  }

  const t = dashboardData.totals
  const pctFul = t.commitments > 0 ? Math.round((t.fulfilled / t.commitments) * 100) : 0
  const pctOver = t.commitments > 0 ? Math.round((t.overdue / t.commitments) * 100) : 0
  const pctWork = Math.max(0, 100 - pctFul - pctOver)

  return (
    <section className="dash-page">
      <header className="dash-page-header">
        <div>
          <h2 className="dash-page-title">Дашборд администратора</h2>
          <p className="dash-page-lead">Сводка по сессиям, поручениям и организациям</p>
        </div>
        <button
          type="button"
          className="btn-secondary dash-refresh-btn"
          disabled={dashBusy}
          onClick={() => void loadDashboard()}
        >
          {dashBusy ? 'Обновление…' : 'Обновить'}
        </button>
      </header>

      <div className="dash-kpi-row">
        <div className="dash-kpi">
          <span className="dash-kpi-label">Опубликовано</span>
          <span className="dash-kpi-num">{t.published}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Всего сессий</span>
          <span className="dash-kpi-num">{t.sessions}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Поручений</span>
          <span className="dash-kpi-num">{t.commitments}</span>
        </div>
        <div className="dash-kpi dash-kpi-good">
          <span className="dash-kpi-label">Выполнено</span>
          <span className="dash-kpi-num">{t.fulfilled}</span>
        </div>
        <div className={`dash-kpi ${t.overdue > 0 ? 'dash-kpi-alert' : ''}`}>
          <span className="dash-kpi-label">Просрочено</span>
          <span className="dash-kpi-num">{t.overdue}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Отзывов</span>
          <span className="dash-kpi-num">{t.observations}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Акимов</span>
          <span className="dash-kpi-num">{t.akims}</span>
        </div>
        {typeof t.operators === 'number' ? (
          <div className="dash-kpi">
            <span className="dash-kpi-label">Операторов</span>
            <span className="dash-kpi-num">{t.operators}</span>
          </div>
        ) : null}
        {typeof t.citizens === 'number' ? (
          <div className="dash-kpi">
            <span className="dash-kpi-label">Граждан</span>
            <span className="dash-kpi-num">{t.citizens}</span>
          </div>
        ) : null}
      </div>

      {t.commitments > 0 ? (
        <div className="dash-progress-card">
          <div className="dash-progress-head">
            <h3 className="dash-progress-title">Общий прогресс поручений</h3>
            <span className="dash-progress-sub">
              Всего {t.commitments} · выполнено {t.fulfilled} · просрочено {t.overdue} · в работе{' '}
              {t.commitments - t.fulfilled - t.overdue}
            </span>
          </div>
          <div className="dash-progress-bar" role="img" aria-label="Распределение поручений по статусам">
            <div
              className="dash-progress-fill dash-fill-green"
              style={{ width: `${pctFul}%` }}
              title={`Выполнено: ${t.fulfilled} (${pctFul}%)`}
            />
            <div
              className="dash-progress-fill dash-fill-red"
              style={{ width: `${pctOver}%` }}
              title={`Просрочено: ${t.overdue} (${pctOver}%)`}
            />
            <div
              className="dash-progress-fill dash-fill-work"
              style={{ width: `${pctWork}%` }}
              title={`В работе: ${t.commitments - t.fulfilled - t.overdue} (${pctWork}%)`}
            />
          </div>
          <div className="dash-progress-legend">
            <span className="legend-green">
              <span className="dash-legend-dot" />
              Выполнено {pctFul}%
            </span>
            <span className="legend-red">
              <span className="dash-legend-dot" />
              Просрочено {pctOver}%
            </span>
            <span className="legend-work">
              <span className="dash-legend-dot" />
              В работе {pctWork}%
            </span>
          </div>
        </div>
      ) : null}

      {dashboardData.orgs.length > 0 ? (
        <>
          <h3 className="dash-section-title">Организации</h3>
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
                      <dt>Сессий</dt>
                      <dd>{o.sessions}</dd>
                    </div>
                    <div className="dash-org-stat">
                      <dt>Поручений</dt>
                      <dd>{o.commitments}</dd>
                    </div>
                    <div className="dash-org-stat dash-org-stat--ok">
                      <dt>Выполнено</dt>
                      <dd>
                        {o.fulfilled}{' '}
                        <span className="dash-org-pct">({o.fulfillment_pct}%)</span>
                      </dd>
                    </div>
                    {o.overdue > 0 ? (
                      <div className="dash-org-stat dash-org-stat--bad">
                        <dt>Просрочено</dt>
                        <dd>
                          {o.overdue}{' '}
                          <span className="dash-org-pct">({o.overdue_pct}%)</span>
                        </dd>
                      </div>
                    ) : null}
                    <div className="dash-org-stat">
                      <dt>Отзывов</dt>
                      <dd>{o.observations}</dd>
                    </div>
                  </dl>
                  <div className="dash-org-bar-wrap">
                    <span className="dash-org-bar-label">Доля выполнения / просрочки</span>
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
          <h3 className="dash-section-title">Просроченные поручения</h3>
          <div className="dash-table-wrap">
          <table className="data-table dash-table">
            <thead>
              <tr>
                <th>Организация</th>
                <th>Сессия</th>
                <th>Поручение</th>
                <th>Ответственный</th>
                <th>Срок</th>
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
                  <td className="small">{item.responsible || '—'}</td>
                  <td className="small nowrap">{item.deadline || '—'}</td>
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
