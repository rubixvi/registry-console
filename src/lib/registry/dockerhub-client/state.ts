import 'server-only'

import { createGate } from '@/lib/security/gate'

export const enter = createGate(4, 1)
