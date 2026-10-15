export type AuditEntry = {
  id: number
  at: string
  actor: string
  action: string
  target: string
}

export type AuditFilters = {
  actor: string
  action: string
  query: string
  from: string
  to: string
}

export type AuditInput = AuditFilters & {
  before: number
  n: number
}

export type AuditPage = {
  items: AuditEntry[]
  next: number | null
  total: number
}
