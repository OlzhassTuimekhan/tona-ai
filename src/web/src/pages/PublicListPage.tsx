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
    <div className="public-landing">
      <header className="landing-hero">
        <p className="landing-eyebrow">Портал открытых решений</p>
        <h1 className="landing-title">Совещания и поручения — на виду, с обратной связью горожан</h1>
        <p className="landing-lead">
          JOIS публикует итоги работы органов: тема, поручения и сроки. Вы открываете карточку без регистрации,
          смотрите суть и при желании оставляете отзыв или отметку по факту — так формируется рейтинг и прозрачность.
        </p>
        <div className="landing-hero-actions">
          <a href="#katalog" className="landing-cta-primary">
            К каталогу решений
          </a>
          <Link to="/ratings" className="landing-cta-ghost">
            Рейтинг организаций
          </Link>
        </div>

        {platformStats ? (
          <div className="landing-stats" aria-label="Сводка по платформе">
            <div className="landing-stat-card">
              <span className="landing-stat-value">{platformStats.sessions}</span>
              <span className="landing-stat-label">сессий обработано</span>
            </div>
            <div className="landing-stat-card">
              <span className="landing-stat-value">{platformStats.commitments}</span>
              <span className="landing-stat-label">поручений извлечено</span>
            </div>
            <div className="landing-stat-card">
              <span className="landing-stat-value">{platformStats.observations}</span>
              <span className="landing-stat-label">отзывов граждан</span>
            </div>
            {platformStats.overdue > 0 ? (
              <div className="landing-stat-card landing-stat-card-alert">
                <span className="landing-stat-value">{platformStats.overdue}</span>
                <span className="landing-stat-label">просрочено поручений</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <section className="landing-section" aria-labelledby="landing-about">
        <h2 id="landing-about" className="landing-section-title">
          Что это за сервис
        </h2>
        <p className="landing-section-intro">
          Единое место, где администрация выкладывает решения после совещаний, а горожане видят статус исполнения и
          могут реагировать — без бюрократии на этапе просмотра.
        </p>
        <div className="landing-features">
          <div className="landing-feature">
            <span className="landing-feature-icon" aria-hidden>
              01
            </span>
            <h3 className="landing-feature-title">Прозрачность</h3>
            <p className="landing-feature-text">
              Поручения и сроки собраны в карточке сессии. Цветовой рейтинг показывает, где всё под контролем, а где
              нужно внимание.
            </p>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon" aria-hidden>
              02
            </span>
            <h3 className="landing-feature-title">Ваша позиция</h3>
            <p className="landing-feature-text">
              Комментарий или отметка по факту исполнения — данные участвуют в оценке работы организации и видны в
              контексте решения.
            </p>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon" aria-hidden>
              03
            </span>
            <h3 className="landing-feature-title">Без барьера на входе</h3>
            <p className="landing-feature-text">
              Каталог и текст решений доступны без аккаунта. Регистрация понадобится только если решите оставить отзыв
              или отметку.
            </p>
          </div>
        </div>
      </section>

      <section className="egov-quick-section" aria-labelledby="egov-quick">
        <h2 id="egov-quick" className="egov-section-title">
          Разделы портала
        </h2>
        <div className="egov-quick-grid">
          <a href="#katalog" className="egov-tile">
            <span className="egov-tile-icon" aria-hidden>
              К
            </span>
            <div className="egov-tile-body">
              <p className="egov-tile-title">Решения и поручения</p>
              <p className="egov-tile-desc">Каталог опубликованных совещаний с фильтрами</p>
            </div>
          </a>
          <Link to="/ratings" className="egov-tile">
            <span className="egov-tile-icon" aria-hidden>
              Р
            </span>
            <div className="egov-tile-body">
              <p className="egov-tile-title">Рейтинг организаций</p>
              <p className="egov-tile-desc">Сводка по отзывам и исполнению</p>
            </div>
          </Link>
          <a href="#landing-about" className="egov-tile">
            <span className="egov-tile-icon" aria-hidden>
              i
            </span>
            <div className="egov-tile-body">
              <p className="egov-tile-title">О сервисе</p>
              <p className="egov-tile-desc">Зачем нужен портал и кому он полезен</p>
            </div>
          </a>
          <a href="#landing-how" className="egov-tile">
            <span className="egov-tile-icon" aria-hidden>
              ?
            </span>
            <div className="egov-tile-body">
              <p className="egov-tile-title">Как пользоваться</p>
              <p className="egov-tile-desc">Шаги от просмотра до отзыва</p>
            </div>
          </a>
          <Link to="/login" className="egov-tile">
            <span className="egov-tile-icon" aria-hidden>
              В
            </span>
            <div className="egov-tile-body">
              <p className="egov-tile-title">Войти</p>
              <p className="egov-tile-desc">Для отзыва или отметки по факту</p>
            </div>
          </Link>
        </div>
      </section>

      <section className="egov-two-col" aria-label="Полезные ссылки">
        <div>
          <h3 className="egov-list-title">Сервисы</h3>
          <ul className="egov-link-list">
            <li>
              <a href="#katalog">Каталог решений</a>
            </li>
            <li>
              <Link to="/ratings">Рейтинг по организациям</Link>
            </li>
            <li>
              <a href="#landing-how">Как это работает</a>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="egov-list-title">Частые действия</h3>
          <ul className="egov-link-list">
            <li>
              <Link to="/login">Вход в личный кабинет</Link>
            </li>
            <li>
              <Link to="/register">Регистрация гражданина</Link>
            </li>
            <li>
              <a href="#katalog">Найти решение по городу или названию</a>
            </li>
          </ul>
        </div>
      </section>

      <section className="landing-section landing-section-how" aria-labelledby="landing-how">
        <h2 id="landing-how" className="landing-section-title">
          Как это работает
        </h2>
        <ol className="landing-steps">
          <li>
            <strong>Опубликовано.</strong> Сотрудники выкладывают итог совещания: заголовок, организация, список
            поручений.
          </li>
          <li>
            <strong>Вы выбираете карточку.</strong> Фильтруйте по городу, названию или по рейтингу (все / внимание /
            контроль / хорошо).
          </li>
          <li>
            <strong>Читаете и реагируете.</strong> На странице решения — суть, сроки, отзывы. При необходимости —
            комментарий или отметка с фото факта.
          </li>
          <li>
            <strong>Сводка.</strong> Раздел «Рейтинг» агрегирует организации по отклику граждан и динамике исполнения.
          </li>
        </ol>
      </section>

      <section className="landing-section landing-catalog" id="katalog">
        <div className="landing-catalog-panel">
          <div className="landing-catalog-head">
            <div>
              <h2 className="landing-catalog-title">Опубликованные решения</h2>
              <p className="landing-catalog-sub">Поиск и фильтры — обновление списка по кнопке или после смены города.</p>
            </div>
            <button type="button" className="btn-secondary" disabled={publicBusy} onClick={() => void loadPublic()}>
              Обновить список
            </button>
          </div>

          {publicErr ? <p className="error panel-inline-err">{publicErr}</p> : null}

          <div className="citizen-filters landing-filters catalog-filter-bar">
            <input
              className="search-input catalog-filter-search"
              type="text"
              placeholder="Поиск по названию, организации, городу…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadPublic()
              }}
            />
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
            <button type="button" className="btn-secondary btn-sm catalog-filter-submit" disabled={publicBusy} onClick={() => void loadPublic()}>
              Найти
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
                Сбросить
              </button>
            ) : null}
          </div>

          <div className="rating-filter-bar landing-rating-bar" role="group" aria-label="Фильтр по рейтингу">
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
            <p className="muted landing-catalog-status">Загрузка…</p>
          ) : filteredPublicRows.length === 0 ? (
            <p className="muted lead landing-catalog-status">
              {ratingFilter !== 'all'
                ? 'Нет сессий с таким рейтингом.'
                : 'Здесь появятся решения, когда их выложит администрация. Регистрация для просмотра не нужна.'}
            </p>
          ) : (
            <div className="public-cards">
              {filteredPublicRows.map((s) => (
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
                  </div>
                  <Link to={`/public/${s.id}`} className="public-card-cta">
                    Открыть
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <p className="landing-footer-brand">
            JO<span>IS</span> — открытые решения власти для горожан
          </p>
          <nav className="landing-footer-nav" aria-label="Навигация в подвале">
            <Link to="/public">Главная</Link>
            <Link to="/ratings">Рейтинг</Link>
            <Link to="/login">Войти</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
