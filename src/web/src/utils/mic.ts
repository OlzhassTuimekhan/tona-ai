import i18n from '@/i18n'

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

export function getRecordingEnvironmentHint(): string | null {
  if (typeof window === 'undefined') return null
  if (!isSecureRecordingContext()) {
    const link = suggestedHttpsRecordingUrl()
    const tail = link ? i18n.t('mic.insecureTail', { link }) : ''
    return i18n.t('mic.insecureHint', { tail })
  }
  if (!getUserMediaImpl()) {
    return i18n.t('mic.noGumApi')
  }
  if (!isMediaRecorderAvailable()) {
    return i18n.t('mic.noMediaRecorder')
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
  throw new MicAccessError(i18n.t('mic.insecureError'), 'insecure')
}

function throwNoApi(): never {
  throw new MicAccessError(i18n.t('mic.noApiError'), 'no_api')
}

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
        return i18n.t('mic.denied')
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return i18n.t('mic.notFound')
      case 'NotReadableError':
      case 'TrackStartError':
        return i18n.t('mic.busy')
      case 'OverconstrainedError':
        return i18n.t('mic.overconstrained')
      case 'SecurityError':
        return i18n.t('mic.securityBlocked')
      case 'AbortError':
        return i18n.t('mic.aborted')
      default:
        break
    }
  }
  if (err instanceof Error && err.message && !err.message.includes('undefined')) {
    return err.message
  }
  return i18n.t('mic.generic')
}

export function describeRecordingError(err: unknown): string {
  return humanizeMicError(err)
}
