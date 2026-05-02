import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en'
import kk from '@/locales/kk'
import ru from '@/locales/ru'

export const JOIS_LANG_STORAGE = 'jois_lang'

export function getInitialLanguage(): string {
  if (typeof window === 'undefined') return 'kk'
  const s = localStorage.getItem(JOIS_LANG_STORAGE)
  if (s === 'kk' || s === 'ru' || s === 'en') return s
  return 'kk'
}

export function persistLanguage(lng: string): void {
  localStorage.setItem(JOIS_LANG_STORAGE, lng)
}

function setHtmlLang(lng: string): void {
  if (typeof document === 'undefined') return
  const short = lng.split('-')[0] ?? lng
  document.documentElement.lang = short === 'kk' ? 'kk' : short
}

void i18n.use(initReactI18next).init({
  resources: {
    kk: { translation: kk },
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: getInitialLanguage(),
  fallbackLng: ['ru', 'en'],
  supportedLngs: ['kk', 'ru', 'en'],
  interpolation: { escapeValue: false },
})

setHtmlLang(i18n.language)
i18n.on('languageChanged', (lng) => {
  setHtmlLang(lng)
})

export default i18n
