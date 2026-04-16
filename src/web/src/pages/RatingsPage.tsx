import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchOrgRatings, type OrgRating } from '@/api/client'
import { RatingBadge } from '@/components/jois-ui'

export default function RatingsPage() {
  const navigate = useNavigate()
  const [orgRatings, setOrgRatings] = useState<OrgRating[]>([])

  const loadRatings = useCallback(async () => {
    try {
      setOrgRatings(await fetchOrgRatings())
    } catch {
      setOrgRatings([])
    }
  }, [])

  useEffect(() => {
    void loadRatings()
  }, [loadRatings])

  return (
    <section className="panel panel-citizen ratings-page">
      <div className="row space-between citizen-toolbar">
        <h2 className="panel-title panel-title-plain">Рейтинг органов власти</h2>
        <button type="button" className="btn-secondary" onClick={() => void loadRatings()}>
          Обновить
        </button>
      </div>
      <p className="muted">
        Рейтинг формируется на основе отзывов горожан. Отзывы с фото имеют повышенный вес. Чем краснее
        рейтинг — тем больше внимания требуется.
      </p>
      {orgRatings.length === 0 ? (
        <p className="muted lead">Пока нет данных для рейтинга.</p>
      ) : (
        <div className="ratings-grid">
          {orgRatings.map((r) => (
            <article key={r.public_org} className={`rating-card rating-card-${r.level}`}>
              <div className="rating-card-header">
                <h3 className="rating-card-org">{r.public_org}</h3>
                <RatingBadge rating={r} size="large" />
              </div>
              <div className="rating-card-score">
                <div className="score-bar">
                  <div className="score-fill" style={{ width: `${r.score}%` }} />
                </div>
                <span className="score-label">{r.score}/100</span>
              </div>
              <div className="rating-card-stats">
                <span>Сессий: {r.sessions_count}</span>
                <span>Отзывов: {r.observations_total}</span>
                <span>С фото: {r.observations_with_photo}</span>
              </div>
              <div className="rating-card-breakdown">
                <span className="stat-positive">Работа сделана: {r.positive}</span>
                <span className="stat-neutral">Присутствовал: {r.neutral}</span>
                <span className="stat-negative">Оспариваний: {r.negative}</span>
              </div>
              <button
                type="button"
                className="btn-block"
                onClick={() =>
                  navigate('/public', {
                    state: { prefillSearch: r.public_org },
                  })
                }
              >
                Посмотреть сессии
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
