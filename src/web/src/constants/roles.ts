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

export const ROLE_OPTIONS_ADMIN: { value: string; label: string }[] = [
  { value: 'admin', label: 'Администратор' },
  { value: 'akim', label: 'Аким / госорганы (все профили анализа)' },
  { value: 'general', label: 'Оператор — общий анализ' },
  { value: 'meeting', label: 'Оператор — совещания / госорганы' },
  { value: 'court', label: 'Оператор — судебное заседание' },
  { value: 'police', label: 'Оператор — полиция / протокол' },
  { value: 'call_center', label: 'Оператор — call-центр' },
]
