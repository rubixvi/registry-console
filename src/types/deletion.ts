export type DeletionEntry = {
  digest: string
  tags: string[]
}

export type DeletionPlan = {
  id: string
  repository: string
  entries: DeletionEntry[]
  expires: number
}

export type DeletionResult = DeletionEntry & {
  success: boolean
  error?: string
}

export type BulkDeletionResult = {
  results: DeletionResult[]
  deleted: number
  failed: number
}

export type PlanRow = {
  id: string
  repository: string
  value: string
  expires: number
}

export type StoredPlan = {
  fingerprint: string
  entries: DeletionEntry[]
}
