import { NextResponse } from 'next/server'

import { audit } from '@/lib/database/audit'
import { removeRegistry, updateRegistry } from '@/lib/registry/store'
import { api } from '@/lib/security/api'
import { readJson } from '@/lib/security/request'
import { registryInput } from '@/lib/validation/registry'

export const DELETE = api(async (_request, context, identity) => {
  const { id } = await context.params

  removeRegistry(id)
  audit(identity.username, 'registry.remove-connection', id)

  return NextResponse.json({ success: true })
}, 'admin')

export const PUT = api(async (request, context, identity) => {
  const { id } = await context.params
  const input = await readJson(request, registryInput)

  updateRegistry(id, input)
  audit(identity.username, 'registry.update', id)

  return NextResponse.json({ success: true })
}, 'admin')
