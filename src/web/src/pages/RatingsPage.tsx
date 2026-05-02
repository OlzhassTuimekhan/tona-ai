import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { fetchOrgRatings, type OrgRating } from '@/api/client'
import { RatingBadge } from '@/components/jois-ui'

export default function RatingsPage() {
  const { t } = useTranslation()
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
        <h2 className="panel-title panel-title-plain">{t('ratings.title')}</h2>
        <button type="button" className="btn-secondary" onClick={() => void loadRatings()}>
          {t('ratings.refresh')}
        </button>
      </div>
      <p className="muted">{t('ratings.lead')}</p>
      {orgRatings.length === 0 ? (
        <p className="muted lead">{t('ratings.empty')}</p>
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
                <span>{t('ratings.statSessions', { n: r.sessions_count })}</span>
                <span>{t('ratings.statObs', { n: r.observations_total })}</span>
                <span>{t('ratings.statPhoto', { n: r.observations_with_photo })}</span>
              </div>
              <div className="rating-card-breakdown">
                <span className="stat-positive">{t('ratings.positive', { n: r.positive })}</span>
                <span className="stat-neutral">{t('ratings.neutral', { n: r.neutral })}</span>
                <span className="stat-negative">{t('ratings.negative', { n: r.negative })}</span>
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
                {t('ratings.viewSessions')}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
