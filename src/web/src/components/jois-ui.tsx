import type { OrgRating, RatingInfo } from '@/api/client'
import { useTranslation } from 'react-i18next'

export function DeadlineBadge({
  status,
  deadline,
}: {
  status?: string
  deadline?: string
}) {
  const { t } = useTranslation()
  const label = String(deadline ?? '').trim()
  if (status === 'fulfilled') {
    return (
      <span className="badge badge-fulfilled" title={t('jois.fulfilledTitle')}>
        {label ? t('jois.fulfilledWithDate', { date: label }) : t('jois.fulfilled')}
      </span>
    )
  }
  if (!label && (!status || status === 'no_deadline')) {
    return <span className="badge muted-badge">{t('jois.noDeadline')}</span>
  }
  if (status === 'overdue') {
    return (
      <span className="badge badge-overdue" title={t('jois.overdueTitle')}>
        {label || t('jois.overdue')}
      </span>
    )
  }
  if (status === 'upcoming') {
    return (
      <span className="badge badge-upcoming" title={t('jois.upcomingTitle')}>
        {label || t('jois.upcoming')}
      </span>
    )
  }
  if (status === 'ok' || label) {
    return <span className="badge badge-ok-deadline">{label}</span>
  }
  return <span className="badge muted-badge">{t('jois.noDeadline')}</span>
}

export function FulfillmentBadge({
  fulfillment,
  deadlineStatus,
}: {
  fulfillment?: string
  deadlineStatus?: string
}) {
  const { t } = useTranslation()
  if (fulfillment === 'fulfilled') {
    return <span className="fulfillment-tag fulfillment-done">{t('jois.akimDone')}</span>
  }
  if (deadlineStatus === 'overdue') {
    return <span className="fulfillment-tag fulfillment-overdue">{t('jois.overdueTag')}</span>
  }
  if (fulfillment === 'pending' && (deadlineStatus === 'ok' || deadlineStatus === 'upcoming')) {
    return <span className="fulfillment-tag fulfillment-in-work">{t('jois.inProgress')}</span>
  }
  return null
}

export function CommitmentsEvidenceTable({
  commitments,
  emptyLabel,
  onSeek,
}: {
  commitments: Record<string, unknown>[]
  emptyLabel?: string
  onSeek?: (seconds: number) => void
}) {
  const { t } = useTranslation()
  const empty = emptyLabel ?? t('jois.noCommitments')
  if (commitments.length === 0) {
    return <p className="muted">{empty}</p>
  }
  return (
    <table className="data-table commitments">
      <thead>
        <tr>
          <th>{t('jois.thGist')}</th>
          <th>{t('jois.thResponsible')}</th>
          <th>{t('jois.thDeadline')}</th>
          <th>{t('jois.thQuote')}</th>
          <th>{t('jois.thCheck')}</th>
          {onSeek ? <th className="narrow-col">{t('jois.thRecording')}</th> : null}
        </tr>
      </thead>
      <tbody>
        {commitments.map((c, i) => {
          const ds = String(c.deadline_status ?? '')
          const isOverdue = ds === 'overdue'
          const isFulfilled =
            ds === 'fulfilled' || String(c.fulfillment_status ?? '') === 'fulfilled'
          const ts = c.timestamp_start
          const canSeek = onSeek && typeof ts === 'number' && Number.isFinite(ts)
          return (
            <tr key={i} className={isOverdue ? 'row-overdue' : isFulfilled ? 'row-fulfilled' : ''}>
              <td>{String(c.description ?? t('common.dash'))}</td>
              <td className="small">{String(c.responsible ?? t('common.dash'))}</td>
              <td>
                <DeadlineBadge status={ds || undefined} deadline={String(c.deadline ?? '')} />
              </td>
              <td className="quote-cell">{String(c.quote ?? t('common.dash'))}</td>
              <td>
                {c.evidence_note === 'нет_цитаты' ? (
                  <span className="badge muted-badge">{t('jois.evidenceNone')}</span>
                ) : c.evidence_verified === true ? (
                  <span className="badge ok">{t('jois.evidenceOk')}</span>
                ) : c.evidence_verified === false ? (
                  <span className="badge warn">{t('jois.evidenceWarn')}</span>
                ) : (
                  <span className="badge">{t('common.dash')}</span>
                )}
              </td>
              {onSeek ? (
                <td className="narrow-col">
                  {canSeek ? (
                    <button
                      type="button"
                      className="btn-seek-audio"
                      title={t('jois.seekTitle')}
                      onClick={() => onSeek(Number(ts))}
                    >
                      ▶
                    </button>
                  ) : (
                    <span className="muted">{t('common.dash')}</span>
                  )}
                </td>
              ) : null}
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
  const { t } = useTranslation()
  const cls = `rating-badge rating-${rating.level}${size === 'large' ? ' rating-large' : ''}`
  const labels: Record<string, string> = {
    green: t('jois.ratingGood'),
    yellow: t('jois.ratingYellow'),
    red: t('jois.ratingRed'),
  }
  return (
    <span className={cls} title={t('jois.ratingScore', { score: rating.score })}>
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
