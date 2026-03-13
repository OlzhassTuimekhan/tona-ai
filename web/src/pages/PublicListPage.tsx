import { useCallback, useEffect, useState } from 'react'
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
    // Первичная загрузка; дальше — кнопки «Найти» / «Обновить»
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredPublicRows =
    ratingFilter === 'all' ? publicRows : publicRows.filter((s) => s.rating?.level === ratingFilter)

  return (
    <section className="panel panel-citizen">
      <p className="tagline" style={{ marginBottom: '1rem' }}>
        Открытые решения власти — ваш комментарий или отметка по факту.
      </p>
      {platformStats ? (
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-num">{platformStats.sessions}</span>
            <span className="hero-label">сессий обработано</span>
          </div>
          <div className="hero-stat">
            <span className="hero-num">{platformStats.commitments}</span>
            <span className="hero-label">поручений извлечено</span>
          </div>
          <div className="hero-stat">
            <span className="hero-num">{platformStats.observations}</span>
            <span className="hero-label">отзывов граждан</span>
          </div>
          {platformStats.overdue > 0 ? (
            <div className="hero-stat hero-stat-alert">
              <span className="hero-num">{platformStats.overdue}</span>
              <span className="hero-label">просрочено</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {publicErr ? <p className="error panel-inline-err">{publicErr}</p> : null}
      <div className="row space-between citizen-toolbar">
        <h2 className="panel-title panel-title-plain">Что опубликовали</h2>
        <button type="button" className="btn-secondary" disabled={publicBusy} onClick={() => void loadPublic()}>
          Обновить список
        </button>
      </div>

      <div className="citizen-filters">
        <input
          className="search-input"
          type="text"
          placeholder="Поиск по названию, организации, городу…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void loadPublic()
          }}
        />
        <div className="filter-row">
          {availableCities.length > 0 ? (
            <select className="city-select" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
              <option value="">Все города</option>
              {availableCities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="btn-secondary btn-sm" disabled={publicBusy} onClick={() => void loadPublic()}>
            Найти
          </button>
          {searchQuery || cityFilter ? (
            <button
              type="button"
              className="btn-text btn-sm"
              onClick={() => {
                setSearchQuery('')
                setCityFilter('')
              }}
            >
              Сбросить
            </button>
          ) : null}
        </div>
      </div>

      <div className="rating-filter-bar" role="group" aria-label="Фильтр по рейтингу">
        <button
          type="button"
          className={ratingFilter === 'all' ? 'filter-chip active' : 'filter-chip'}
          onClick={() => setRatingFilter('all')}
        >
          Все
        </button>
        <button
          type="button"
          className={ratingFilter === 'red' ? 'filter-chip filter-red active' : 'filter-chip filter-red'}
          onClick={() => setRatingFilter('red')}
        >
          Требует внимания
        </button>
        <button
          type="button"
          className={ratingFilter === 'yellow' ? 'filter-chip filter-yellow active' : 'filter-chip filter-yellow'}
          onClick={() => setRatingFilter('yellow')}
        >
          На контроле
        </button>
        <button
          type="button"
          className={ratingFilter === 'green' ? 'filter-chip filter-green active' : 'filter-chip filter-green'}
          onClick={() => setRatingFilter('green')}
        >
          Хорошо
        </button>
      </div>

      {publicBusy && publicRows.length === 0 ? (
        <p className="muted">Загрузка…</p>
      ) : filteredPublicRows.length === 0 ? (
        <p className="muted lead">
          {ratingFilter !== 'all'
            ? 'Нет сессий с таким рейтингом.'
            : 'Здесь появятся решения, когда их выложит администрация. Регистрация не нужна.'}
        </p>
      ) : (
        <div className="public-cards">
          {filteredPublicRows.map((s) => (
            <article key={s.id} className={`public-card public-card-${s.rating?.level ?? 'yellow'}`}>
              <div className="public-card-header">
                <h3 className="public-card-title">{s.title}</h3>
                {s.rating ? <RatingBadge rating={s.rating} /> : null}
              </div>
              {s.public_org ? <p className="public-card-org">{s.public_org}</p> : null}
              <p className="public-card-meta">
                {new Date(s.created_at).toLocaleDateString()} · поручений: {s.commitments_total}
                {s.observations_total > 0 ? ` · ответов: ${s.observations_total}` : ''}
                {s.observations_with_photo > 0 ? ` · с фото: ${s.observations_with_photo}` : ''}
              </p>
              {s.deadlines_overdue > 0 ? (
                <p className="overdue-line">
                  {s.deadlines_overdue}{' '}
                  {s.deadlines_overdue === 1 ? 'поручение просрочено' : 'поручений просрочено'}
                </p>
              ) : null}
              <Link to={`/public/${s.id}`} className="btn-block" style={{ textAlign: 'center', display: 'block' }}>
                Открыть
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
