import { z } from 'zod'

import { SEVERITIES } from '@/types/scan'

export const vulnerabilitySchema = z.object({
  VulnerabilityID: z.string().max(256),
  PkgName: z.string().max(1024),
  InstalledVersion: z.string().max(1024),
  FixedVersion: z.string().max(1024).default(''),
  Severity: z.enum(SEVERITIES).catch('UNKNOWN'),
  Title: z.string().max(4096).default(''),
})

const scanResult = z.object({
  Target: z.string().max(2048),
  Vulnerabilities: z.array(vulnerabilitySchema).max(50_000).optional(),
})

export const outputSchema = z.object({
  SchemaVersion: z.literal(2),
  Results: z.array(scanResult).max(1000).optional(),
})
