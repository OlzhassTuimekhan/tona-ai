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

  return (
    <section className="panel dash-panel">
      <div className="row space-between">
        <h2 className="panel-title">Дашборд администратора</h2>
        <button type="button" className="btn-secondary" disabled={dashBusy} onClick={() => void loadDashboard()}>
          Обновить
        </button>
      </div>

      <div className="dash-kpi-row">
        <div className="dash-kpi">
          <span className="dash-kpi-num">{t.published}</span>
          <span className="dash-kpi-label">Опубликовано</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-num">{t.sessions}</span>
          <span className="dash-kpi-label">Всего сессий</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-num">{t.commitments}</span>
          <span className="dash-kpi-label">Поручений</span>
        </div>
        <div className="dash-kpi dash-kpi-good">
          <span className="dash-kpi-num">{t.fulfilled}</span>
          <span className="dash-kpi-label">Выполнено</span>
        </div>
        <div className={`dash-kpi ${t.overdue > 0 ? 'dash-kpi-alert' : ''}`}>
          <span className="dash-kpi-num">{t.overdue}</span>
          <span className="dash-kpi-label">Просрочено</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-num">{t.observations}</span>
          <span className="dash-kpi-label">Отзывов</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-num">{t.akims}</span>
          <span className="dash-kpi-label">Акимов</span>
        </div>
        {typeof t.operators === 'number' ? (
          <div className="dash-kpi">
            <span className="dash-kpi-num">{t.operators}</span>
            <span className="dash-kpi-label">Операторов</span>
          </div>
        ) : null}
        {typeof t.citizens === 'number' ? (
          <div className="dash-kpi">
            <span className="dash-kpi-num">{t.citizens}</span>
            <span className="dash-kpi-label">Граждан</span>
          </div>
        ) : null}
      </div>

      {t.commitments > 0 ? (
        <div className="dash-progress-section">
          <h3 className="subh">Общий прогресс поручений</h3>
          <div className="dash-progress-bar">
            <div
              className="dash-progress-fill dash-fill-green"
              style={{ width: `${Math.round((t.fulfilled / t.commitments) * 100)}%` }}
              title={`Выполнено: ${t.fulfilled}`}
            />
            <div
              className="dash-progress-fill dash-fill-red"
              style={{ width: `${Math.round((t.overdue / t.commitments) * 100)}%` }}
              title={`Просрочено: ${t.overdue}`}
            />
          </div>
          <p className="dash-progress-legend">
            <span className="legend-green">Выполнено {Math.round((t.fulfilled / t.commitments) * 100)}%</span>
            <span className="legend-red">Просрочено {Math.round((t.overdue / t.commitments) * 100)}%</span>
            <span className="legend-gray">
              В работе{' '}
              {Math.round(((t.commitments - t.fulfilled - t.overdue) / t.commitments) * 100)}%
            </span>
          </p>
        </div>
      ) : null}

      {dashboardData.orgs.length > 0 ? (
        <>
          <h3 className="subh">Организации</h3>
          <div className="dash-orgs-grid">
            {dashboardData.orgs.map((o) => {
              const level = o.overdue > 0 ? (o.overdue_pct > 30 ? 'red' : 'yellow') : 'green'
              return (
                <div key={o.org} className={`dash-org-card dash-org-${level}`}>
                  <div className="dash-org-header">
                    <strong>{o.org}</strong>
                    {o.city ? <span className="dash-org-city">{o.city}</span> : null}
                  </div>
                  <div className="dash-org-metrics">
                    <span>Сессий: {o.sessions}</span>
                    <span>Поручений: {o.commitments}</span>
                    <span className="dash-m-good">
                      Выполнено: {o.fulfilled} ({o.fulfillment_pct}%)
                    </span>
                    {o.overdue > 0 ? (
                      <span className="dash-m-bad">
                        Просрочено: {o.overdue} ({o.overdue_pct}%)
                      </span>
                    ) : null}
                    <span>Отзывов: {o.observations}</span>
                  </div>
                  <div className="dash-org-bar">
                    <div className="dash-org-fill-ok" style={{ width: `${o.fulfillment_pct}%` }} />
                    <div className="dash-org-fill-bad" style={{ width: `${o.overdue_pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : null}

      {dashboardData.overdue_items.length > 0 ? (
        <>
          <h3 className="subh">Просроченные поручения</h3>
          <table className="data-table">
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
        </>
      ) : null}
    </section>
  )
}
