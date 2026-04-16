export const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export const API_V1 = `${API_ORIGIN}/api/v1`

export function resolvePublicAssetUrl(pathOrUrl: string | null | undefined): string | null {
  if (pathOrUrl == null || !String(pathOrUrl).trim()) return null
  const t = String(pathOrUrl).trim()
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  if (t.startsWith('/') && API_ORIGIN) return `${API_ORIGIN}${t}`
  return t
}
