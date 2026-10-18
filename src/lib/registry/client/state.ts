import 'server-only'

import { MAX_INFLIGHT } from '@/lib/registry/client/constants'
import { createGate } from '@/lib/security/gate'

export const enter = createGate(MAX_INFLIGHT, 2)
