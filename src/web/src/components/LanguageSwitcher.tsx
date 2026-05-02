import { useTranslation } from 'react-i18next'
import { persistLanguage } from '@/i18n'

type Props = {
  className?: string
  compact?: boolean
}

export function LanguageSwitcher({ className, compact }: Props) {
  const { t, i18n } = useTranslation()

  return (
    <label className={['language-switcher', className].filter(Boolean).join(' ')}>
      {!compact ? <span className="language-switcher-label">{t('language.label')}</span> : null}
      <select
        className="language-switcher-select"
        value={i18n.language.split('-')[0]}
        onChange={(e) => {
          const lng = e.target.value
          void i18n.changeLanguage(lng)
          persistLanguage(lng)
        }}
        aria-label={t('language.label')}
      >
        <option value="kk">{t('language.nameKk')}</option>
        <option value="ru">{t('language.nameRu')}</option>
        <option value="en">{t('language.nameEn')}</option>
      </select>
    </label>
  )
}
