import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AuditLog } from '@/components/audit/log'
import { Heading } from '@/components/layout/heading'
import { getIdentity } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'Audit',
  description: 'Review workspace activity and events.',
}

export default async function AuditPage() {
  const identity = await getIdentity()

  if (identity?.role !== 'admin') redirect('/')

  return (
    <>
      <Heading description="Review workspace activity and events." title="Audit" />

      <AuditLog />
    </>
  )
}
