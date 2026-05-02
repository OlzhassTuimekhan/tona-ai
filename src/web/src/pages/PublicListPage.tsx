import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import {
  fetchCities,
  fetchStats,
  listPublicSessions,
  type PlatformStats,
  type PublicSessionRow,
} from '@/api/client'
import { RatingBadge } from '@/components/jois-ui'

export default function PublicListPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const [searchQuery, setSearchQuery] = useState(
    () => (location.state as { prefillSearch?: string } | null)?.prefillSearch ?? '',
  )
  const [cityFilter, setCityFilter] = useState('')
  const [availableCities, setAvailableCities] = useState<string[]>([])
  const [publicRows, setPublicRows] = useState<PublicSessionRow[]>([])
  const [publicErr, setPublicErr] = useState<string | null>(null)
  const [publicBusy, setPublicBusy] = useState(false)
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [ratingFilter, setRatingFilter] = useState<'all' | 'red' | 'yellow' | 'green'>('all')

  useEffect(() => {
    if (location.state && typeof (location.state as { prefillSearch?: string }).prefillSearch === 'string') {
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const loadPublic = useCallback(async () => {
    setPublicErr(null)
    setPublicBusy(true)
    try {
      const filters: Record<string, string> = {}
      if (cityFilter) filters.city = cityFilter
      if (searchQuery.trim()) filters.search = searchQuery.trim()
      setPublicRows(await listPublicSessions(filters))
    } catch (e) {
      setPublicErr(String(e))
    } finally {
      setPublicBusy(false)
    }
  }, [cityFilter, searchQuery])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setPublicErr(null)
      setPublicBusy(true)
      try {
        const filters: Record<string, string> = {}
        if (cityFilter) filters.city = cityFilter
        if (searchQuery.trim()) filters.search = searchQuery.trim()
        const rows = await listPublicSessions(filters)
        if (!cancelled) setPublicRows(rows)
      } catch (e) {
        if (!cancelled) setPublicErr(String(e))
      } finally {
        if (!cancelled) setPublicBusy(false)
      }
    })()
    fetchCities()
      .then((c) => setAvailableCities(c.cities))
      .catch(() => {})
    fetchStats()
      .then(setPlatformStats)
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredPublicRows =
    ratingFilter === 'all' ? publicRows : publicRows.filter((s) => s.rating?.level === ratingFilter)

  return (
    <div className="public-landing">
      <header className="landing-hero">
        <p className="landing-eyebrow">{t('publicLanding.eyebrow')}</p>
        <h1 className="landing-title">{t('publicLanding.heroTitle')}</h1>
        <p className="landing-lead">{t('publicLanding.heroLead')}</p>
        <div className="landing-hero-actions">
          <a href="#katalog" className="landing-cta-primary">
            {t('publicLanding.ctaCatalog')}
          </a>
          <Link to="/ratings" className="landing-cta-ghost">
            {t('publicLanding.ctaRatings')}
          </Link>
        </div>

        {platformStats ? (
          <div className="landing-stats" aria-label={t('common.statsSummary')}>
            <div className="landing-stat-card">
              <span className="landing-stat-value">{platformStats.sessions}</span>
              <span className="landing-stat-label">{t('publicLanding.statSessions')}</span>
            </div>
            <div className="landing-stat-card">
              <span className="landing-stat-value">{platformStats.commitments}</span>
              <span className="landing-stat-label">{t('publicLanding.statCommitments')}</span>
            </div>
            <div className="landing-stat-card">
              <span className="landing-stat-value">{platformStats.observations}</span>
              <span className="landing-stat-label">{t('publicLanding.statObs')}</span>
            </div>
            {platformStats.overdue > 0 ? (
              <div className="landing-stat-card landing-stat-card-alert">
                <span className="landing-stat-value">{platformStats.overdue}</span>
                <span className="landing-stat-label">{t('publicLanding.statOverdue')}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <section className="landing-section" aria-labelledby="landing-about">
        <h2 id="landing-about" className="landing-section-title">
          {t('publicLanding.aboutTitle')}
        </h2>
        <p className="landing-section-intro">{t('publicLanding.aboutLead')}</p>
        <div className="landing-features">
          <div className="landing-feature">
            <span className="landing-feature-icon" aria-hidden>
              01
            </span>
            <h3 className="landing-feature-title">{t('publicLanding.feat1Title')}</h3>
            <p className="landing-feature-text">{t('publicLanding.feat1')}</p>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon" aria-hidden>
              02
            </span>
            <h3 className="landing-feature-title">{t('publicLanding.feat2Title')}</h3>
            <p className="landing-feature-text">{t('publicLanding.feat2')}</p>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon" aria-hidden>
              03
            </span>
            <h3 className="landing-feature-title">{t('publicLanding.feat3Title')}</h3>
            <p className="landing-feature-text">{t('publicLanding.feat3')}</p>
          </div>
        </div>
      </section>

      <section className="egov-quick-section" aria-labelledby="egov-quick">
        <h2 id="egov-quick" className="egov-section-title">
          {t('publicLanding.portalSections')}
        </h2>
        <div className="egov-quick-grid">
          <a href="#katalog" className="egov-tile">
            <span className="egov-tile-icon" aria-hidden>
              К
            </span>
            <div className="egov-tile-body">
              <p className="egov-tile-title">{t('publicLanding.tileDecisionsTitle')}</p>
              <p className="egov-tile-desc">{t('publicLanding.tileDecisionsDesc')}</p>
            </div>
          </a>
          <Link to="/ratings" className="egov-tile">
            <span className="egov-tile-icon" aria-hidden>
              Р
            </span>
            <div className="egov-tile-body">
              <p className="egov-tile-title">{t('publicLanding.tileRatingsTitle')}</p>
              <p className="egov-tile-desc">{t('publicLanding.tileRatingsDesc')}</p>
            </div>
          </Link>
          <a href="#landing-about" className="egov-tile">
            <span className="egov-tile-icon" aria-hidden>
              i
            </span>
            <div className="egov-tile-body">
              <p className="egov-tile-title">{t('publicLanding.tileAboutTitle')}</p>
              <p className="egov-tile-desc">{t('publicLanding.tileAboutDesc')}</p>
            </div>
          </a>
          <a href="#landing-how" className="egov-tile">
            <span className="egov-tile-icon" aria-hidden>
              ?
            </span>
            <div className="egov-tile-body">
              <p className="egov-tile-title">{t('publicLanding.tileHowTitle')}</p>
              <p className="egov-tile-desc">{t('publicLanding.tileHowDesc')}</p>
            </div>
          </a>
          <Link to="/login" className="egov-tile">
            <span className="egov-tile-icon" aria-hidden>
              В
            </span>
            <div className="egov-tile-body">
              <p className="egov-tile-title">{t('publicLanding.tileLoginTitle')}</p>
              <p className="egov-tile-desc">{t('publicLanding.tileLoginDesc')}</p>
            </div>
          </Link>
        </div>
      </section>

      <section className="egov-two-col" aria-label={t('publicLanding.usefulLinks')}>
        <div>
          <h3 className="egov-list-title">{t('publicLanding.servicesTitle')}</h3>
          <ul className="egov-link-list">
            <li>
              <a href="#katalog">{t('publicLanding.catalogLink')}</a>
            </li>
            <li>
              <Link to="/ratings">{t('publicLanding.ratingsOrgs')}</Link>
            </li>
            <li>
              <a href="#landing-how">{t('publicLanding.howWorksLink')}</a>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="egov-list-title">{t('publicLanding.actionsTitle')}</h3>
          <ul className="egov-link-list">
            <li>
              <Link to="/login">{t('publicLanding.cabinetLogin')}</Link>
            </li>
            <li>
              <Link to="/register">{t('publicLanding.citizenRegister')}</Link>
            </li>
            <li>
              <a href="#katalog">{t('publicLanding.findDecision')}</a>
            </li>
          </ul>
        </div>
      </section>

      <section className="landing-section landing-section-how" aria-labelledby="landing-how">
        <h2 id="landing-how" className="landing-section-title">
          {t('publicLanding.howTitle')}
        </h2>
        <ol className="landing-steps">
          <li>
            <strong>{t('publicLanding.step1Strong')}</strong> {t('publicLanding.step1Rest')}
          </li>
          <li>
            <strong>{t('publicLanding.step2Strong')}</strong> {t('publicLanding.step2Rest')}
          </li>
          <li>
            <strong>{t('publicLanding.step3Strong')}</strong> {t('publicLanding.step3Rest')}
          </li>
          <li>
            <strong>{t('publicLanding.step4Strong')}</strong> {t('publicLanding.step4Rest')}
          </li>
        </ol>
      </section>

      <section className="landing-section landing-catalog" id="katalog">
        <div className="landing-catalog-panel">
          <div className="landing-catalog-head">
            <div>
              <h2 className="landing-catalog-title">{t('publicLanding.catalogTitle')}</h2>
              <p className="landing-catalog-sub">{t('publicLanding.catalogSub')}</p>
            </div>
            <button type="button" className="btn-secondary" disabled={publicBusy} onClick={() => void loadPublic()}>
              {t('common.updateList')}
            </button>
          </div>

          {publicErr ? <p className="error panel-inline-err">{publicErr}</p> : null}

          <div className="citizen-filters landing-filters catalog-filter-bar">
            <input
              className="search-input catalog-filter-search"
              type="text"
              placeholder={t('publicLanding.searchPh')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadPublic()
              }}
            />
            {availableCities.length > 0 ? (
              <select className="city-select" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
                <option value="">{t('publicLanding.allCities')}</option>
                {availableCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="btn-secondary btn-sm catalog-filter-submit"
              disabled={publicBusy}
              onClick={() => void loadPublic()}
            >
              {t('publicLanding.findBtn')}
            </button>
            {searchQuery || cityFilter ? (
              <button
                type="button"
                className="btn-text btn-sm catalog-filter-reset"
                onClick={() => {
                  setSearchQuery('')
                  setCityFilter('')
                }}
              >
                {t('common.reset')}
              </button>
            ) : null}
          </div>

          <div className="rating-filter-bar landing-rating-bar" role="group" aria-label={t('common.ratingFilter')}>
            <button
              type="button"
              className={ratingFilter === 'all' ? 'filter-chip active' : 'filter-chip'}
              onClick={() => setRatingFilter('all')}
            >
              {t('common.all')}
            </button>
            <button
              type="button"
              className={ratingFilter === 'red' ? 'filter-chip filter-red active' : 'filter-chip filter-red'}
              onClick={() => setRatingFilter('red')}
            >
              {t('publicLanding.ratingNeedsAttention')}
            </button>
            <button
              type="button"
              className={ratingFilter === 'yellow' ? 'filter-chip filter-yellow active' : 'filter-chip filter-yellow'}
              onClick={() => setRatingFilter('yellow')}
            >
              {t('publicLanding.ratingOnWatch')}
            </button>
            <button
              type="button"
              className={ratingFilter === 'green' ? 'filter-chip filter-green active' : 'filter-chip filter-green'}
              onClick={() => setRatingFilter('green')}
            >
              {t('publicLanding.ratingGood')}
            </button>
          </div>

          {publicBusy && publicRows.length === 0 ? (
            <p className="muted landing-catalog-status">{t('common.loading')}</p>
          ) : filteredPublicRows.length === 0 ? (
            <p className="muted lead landing-catalog-status">
              {ratingFilter !== 'all' ? t('publicLanding.emptyRatingFilter') : t('publicLanding.emptyNoData')}
            </p>
          ) : (
            <div className="public-cards">
              {filteredPublicRows.map((s) => {
                const obsPart =
                  s.observations_total > 0 ? t('publicLanding.cardObs', { count: s.observations_total }) : ''
                const photoPart =
                  s.observations_with_photo > 0
                    ? t('publicLanding.cardPhoto', { count: s.observations_with_photo })
                    : ''
                return (
                  <article key={s.id} className={`public-card public-card-${s.rating?.level ?? 'yellow'}`}>
                    <div className="public-card-body">
                      <div className="public-card-header">
                        <h3 className="public-card-title">{s.title}</h3>
                        {s.rating ? <RatingBadge rating={s.rating} /> : null}
                      </div>
                      <p
                        className={`public-card-org${s.public_org ? '' : ' public-card-org-empty'}`}
                        aria-hidden={s.public_org ? undefined : true}
                      >
                        {s.public_org || '\u00a0'}
                      </p>
                      <p className="public-card-meta">
                        {t('publicLanding.cardMeta', {
                          date: new Date(s.created_at).toLocaleDateString(),
                          commitments: s.commitments_total,
                          obs: obsPart,
                          photo: photoPart,
                        })}
                      </p>
                      {s.deadlines_overdue > 0 ? (
                        <p className="overdue-line">
                          {s.deadlines_overdue}{' '}
                          {s.deadlines_overdue === 1
                            ? t('publicLanding.overdueOne')
                            : t('publicLanding.overdueMany')}
                        </p>
                      ) : null}
                    </div>
                    <Link to={`/public/${s.id}`} className="public-card-cta">
                      {t('common.open')}
                    </Link>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <p className="landing-footer-brand">
            JO<span>IS</span> — {t('publicLanding.footerSubtitle')}
          </p>
          <nav className="landing-footer-nav" aria-label={t('common.footerNav')}>
            <Link to="/public">{t('publicLanding.footerHome')}</Link>
            <Link to="/ratings">{t('publicLanding.footerRatings')}</Link>
            <Link to="/login">{t('publicLanding.footerLogin')}</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
