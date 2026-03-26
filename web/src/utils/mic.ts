/**
 * Доступ к микрофону: безопасный контекст, legacy getUserMedia, понятные ошибки.
 * На HTTP по IP в LAN `navigator.mediaDevices` часто undefined — не падаем с TypeError.
 */

type LegacyGetUserMedia = (
  this: Navigator,
  constraints: MediaStreamConstraints,
  success: (stream: MediaStream) => void,
  error: (err: Error) => void,
) => void

function getLegacyGetUserMedia(): LegacyGetUserMedia | null {
  const n = navigator as Navigator & {
    getUserMedia?: LegacyGetUserMedia
    webkitGetUserMedia?: LegacyGetUserMedia
    mozGetUserMedia?: LegacyGetUserMedia
    msGetUserMedia?: LegacyGetUserMedia
  }
  return n.getUserMedia || n.webkitGetUserMedia || n.mozGetUserMedia || n.msGetUserMedia || null
}

function getUserMediaImpl(): ((c: MediaStreamConstraints) => Promise<MediaStream>) | null {
  if (typeof navigator === 'undefined') return null
  const md = navigator.mediaDevices
  if (md && typeof md.getUserMedia === 'function') {
    return (constraints) => md.getUserMedia(constraints)
  }
  const legacy = getLegacyGetUserMedia()
  if (!legacy) return null
  return (constraints) =>
    new Promise((resolve, reject) => {
      legacy.call(navigator, constraints, resolve, reject)
    })
}

export function isSecureRecordingContext(): boolean {
  if (typeof window === 'undefined') return true
  return window.isSecureContext === true
}

/** Если страница по HTTP с IP (не localhost), подсказать тот же путь на HTTPS (docker: порт 8443). */
export function suggestedHttpsRecordingUrl(): string | null {
  if (typeof window === 'undefined') return null
  if (window.isSecureContext) return null
  if (window.location.protocol !== 'http:') return null
  const { hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') return null
  const httpsPort = import.meta.env.VITE_HTTPS_PORT ?? '8443'
  const { pathname, search, hash } = window.location
  return `https://${hostname}:${httpsPort}${pathname}${search}${hash}`
}

export function isMediaRecorderAvailable(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
}

/** Короткая подсказка под блоком записи, если запись заведомо недоступна */
export function getRecordingEnvironmentHint(): string | null {
  if (typeof window === 'undefined') return null
  if (!isSecureRecordingContext()) {
    const link = suggestedHttpsRecordingUrl()
    const tail = link
      ? ` Откройте эту же страницу по ссылке: ${link}`
      : ''
    return `Запись с микрофона в этом браузере доступна только по HTTPS или на localhost. По HTTP с IP-адреса в сети — загрузите файл или откройте сайт с SSL.${tail}`
  }
  if (!getUserMediaImpl()) {
    return 'Браузер не отдаёт доступ к микрофону (нет API). Загрузите аудиофайл или обновите браузер.'
  }
  if (!isMediaRecorderAvailable()) {
    return 'Запись в этом браузере недоступна (нет MediaRecorder). Используйте загрузку файла.'
  }
  return null
}

export class MicAccessError extends Error {
  readonly code: 'insecure' | 'no_api' | 'permission' | 'hardware' | 'unknown'

  constructor(
    message: string,
    code: 'insecure' | 'no_api' | 'permission' | 'hardware' | 'unknown',
  ) {
    super(message)
    this.name = 'MicAccessError'
    this.code = code
  }
}

function throwInsecure(): never {
  throw new MicAccessError(
    'Запись с микрофона требует безопасного соединения: HTTPS или localhost. Сейчас страница открыта по незащищённому HTTP (часто так бывает при доступе по IP в локальной сети).',
    'insecure',
  )
}

function throwNoApi(): never {
  throw new MicAccessError(
    'Браузер не поддерживает доступ к микрофону (нет getUserMedia). Обновите браузер или загрузите аудиофайл.',
    'no_api',
  )
}

/**
 * Запрос потока с микрофона с проверками до вызова API.
 */
export async function requestMicrophoneAudio(
  audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
  },
): Promise<MediaStream> {
  if (typeof window !== 'undefined' && !isSecureRecordingContext()) {
    throwInsecure()
  }
  const gum = getUserMediaImpl()
  if (!gum) {
    throwNoApi()
  }
  return gum({ audio })
}

export function humanizeMicError(err: unknown): string {
  if (err instanceof MicAccessError) {
    return err.message
  }
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const name = String((err as { name?: string }).name)
    switch (name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Доступ к микрофону запрещён. Нажмите на значок замка в адресной строке и разрешите микрофон для этого сайта.'
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'Микрофон не найден. Проверьте подключение или выбор устройства ввода в настройках системы.'
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Микрофон занят другим приложением или недоступен. Закройте другие вкладки с записью и повторите.'
      case 'OverconstrainedError':
        return 'Выбранные параметры микрофона не поддерживаются. Попробуйте другое устройство.'
      case 'SecurityError':
        return 'Браузер заблокировал доступ к микрофону из соображений безопасности (нужен HTTPS или localhost).'
      case 'AbortError':
        return 'Запрос к микрофону прерван. Попробуйте ещё раз.'
      default:
        break
    }
  }
  if (err instanceof Error && err.message && !err.message.includes('undefined')) {
    return err.message
  }
  return 'Не удалось получить доступ к микрофону. Проверьте разрешения и попробуйте загрузить файл.'
}

export function describeRecordingError(err: unknown): string {
  return humanizeMicError(err)
}
