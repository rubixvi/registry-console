import { NextResponse } from 'next/server'

import { audit } from '@/lib/database/audit'
import { addRegistry, getRegistries } from '@/lib/registry/store'
import { api } from '@/lib/security/api'
import { readJson } from '@/lib/security/request'
import { registryInput } from '@/lib/validation/registry'

export const GET = api(async () => {
  const registries = getRegistries()

  return NextResponse.json(registries)
})

export const POST = api(async (request, _context, identity) => {
  const input = await readJson(request, registryInput)
  const id = addRegistry(input)

  audit(identity.username, 'registry.add', id)

  return NextResponse.json({ id }, { status: 201 })
}, 'admin')
