import type { OrgRating, RatingInfo } from '@/api/client'

export function DeadlineBadge({
  status,
  deadline,
}: {
  status?: string
  deadline?: string
}) {
  const label = String(deadline ?? '').trim()
  if (status === 'fulfilled') {
    return (
      <span className="badge badge-fulfilled" title="Выполнено">
        {label ? `${label} — выполнено` : 'Выполнено'}
      </span>
    )
  }
  if (!label && (!status || status === 'no_deadline')) {
    return <span className="badge muted-badge">без срока</span>
  }
  if (status === 'overdue') {
    return (
      <span className="badge badge-overdue" title="Срок истёк">
        {label || 'Просрочено'}
      </span>
    )
  }
  if (status === 'upcoming') {
    return (
      <span className="badge badge-upcoming" title="Скоро дедлайн">
        {label || 'Скоро'}
      </span>
    )
  }
  if (status === 'ok' || label) {
    return <span className="badge badge-ok-deadline">{label}</span>
  }
  return <span className="badge muted-badge">без срока</span>
}

export function FulfillmentBadge({
  fulfillment,
  deadlineStatus,
}: {
  fulfillment?: string
  deadlineStatus?: string
}) {
  if (fulfillment === 'fulfilled') {
    return <span className="fulfillment-tag fulfillment-done">Аким: выполнено</span>
  }
  if (deadlineStatus === 'overdue') {
    return <span className="fulfillment-tag fulfillment-overdue">Просрочено</span>
  }
  if (fulfillment === 'pending' && (deadlineStatus === 'ok' || deadlineStatus === 'upcoming')) {
    return <span className="fulfillment-tag fulfillment-in-work">В работе</span>
  }
  return null
}

export function CommitmentsEvidenceTable({
  commitments,
  emptyLabel = 'Нет поручений.',
}: {
  commitments: Record<string, unknown>[]
  emptyLabel?: string
}) {
  if (commitments.length === 0) {
    return <p className="muted">{emptyLabel}</p>
  }
  return (
    <table className="data-table commitments">
      <thead>
        <tr>
          <th>Суть</th>
          <th>Ответственный</th>
          <th>Срок</th>
          <th>Цитата</th>
          <th>Сверка</th>
        </tr>
      </thead>
      <tbody>
        {commitments.map((c, i) => {
          const ds = String(c.deadline_status ?? '')
          const isOverdue = ds === 'overdue'
          const isFulfilled =
            ds === 'fulfilled' || String(c.fulfillment_status ?? '') === 'fulfilled'
          return (
            <tr key={i} className={isOverdue ? 'row-overdue' : isFulfilled ? 'row-fulfilled' : ''}>
              <td>{String(c.description ?? '—')}</td>
              <td className="small">{String(c.responsible ?? '—')}</td>
              <td>
                <DeadlineBadge status={ds || undefined} deadline={String(c.deadline ?? '')} />
              </td>
              <td className="quote-cell">{String(c.quote ?? '—')}</td>
              <td>
                {c.evidence_note === 'нет_цитаты' ? (
                  <span className="badge muted-badge">нет цитаты</span>
                ) : c.evidence_verified === true ? (
                  <span className="badge ok">в тексте</span>
                ) : c.evidence_verified === false ? (
                  <span className="badge warn">не найдено</span>
                ) : (
                  <span className="badge">—</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function RatingBadge({
  rating,
  size = 'normal',
}: {
  rating: RatingInfo | OrgRating
  size?: 'normal' | 'large'
}) {
  const cls = `rating-badge rating-${rating.level}${size === 'large' ? ' rating-large' : ''}`
  const labels: Record<string, string> = {
    green: 'Хорошо',
    yellow: 'На контроле',
    red: 'Требует внимания',
  }
  return (
    <span className={cls} title={`Оценка: ${rating.score}/100`}>
      <span className="rating-dot" />
      {labels[rating.level] ?? rating.level}
    </span>
  )
}

export function truncateText(s: string, max: number): string {
  const t = s.trim()
  if (!t.length) return '—'
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}
