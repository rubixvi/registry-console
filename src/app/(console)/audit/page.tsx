import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AuditLog } from '@/components/audit/log'
import { PageHeading } from '@/components/layout/page-heading'
import { getIdentity } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'Audit',
  description: 'Review workspace activity and authentication events.',
}

export default async function AuditPage() {
  const identity = await getIdentity()

  if (identity?.role !== 'admin') redirect('/')

  return (
    <>
      <PageHeading
        description="Review workspace activity and authentication events."
        title="Audit"
      />

      <AuditLog />
    </>
  )
}
