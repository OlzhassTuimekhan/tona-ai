export const DOMAIN_OPERATOR_ROLES = [
  'akim',
  'general',
  'meeting',
  'court',
  'police',
  'call_center',
] as const

export type DomainOperatorRole = (typeof DOMAIN_OPERATOR_ROLES)[number]

export function canAccessAnalyzeAndRegistry(role: string): boolean {
  return role === 'admin' || DOMAIN_OPERATOR_ROLES.includes(role as DomainOperatorRole)
}

export const ROLE_OPTIONS_ADMIN: { value: string }[] = [
  { value: 'admin' },
  { value: 'akim' },
  { value: 'general' },
  { value: 'meeting' },
  { value: 'court' },
  { value: 'police' },
  { value: 'call_center' },
]
