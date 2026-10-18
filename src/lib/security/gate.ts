import 'server-only'

import { AppError } from '@/lib/security/error'

export function createGate(maximum: number, reserved = 0, timeout = 5000) {
  let active = 0
  let normal = 0
  const waiting: { admin: boolean; grant: () => void }[] = []

  function available(admin: boolean): boolean {
    return active < maximum && (admin || normal < maximum - reserved)
  }

  function drain(): void {
    while (active < maximum) {
      let index = waiting.findIndex((entry) => entry.admin && available(true))

      if (index < 0) index = waiting.findIndex((entry) => available(entry.admin))
      if (index < 0) return

      waiting.splice(index, 1)[0].grant()
    }
  }

  return function enter(admin = false): Promise<() => void> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const entry = {
        admin,
        grant: () => {
          if (timer) clearTimeout(timer)
          active++
          if (!admin) normal++

          let released = false

          resolve(() => {
            if (released) return

            released = true
            active--
            if (!admin) normal--
            drain()
          })
        },
      }

      if (available(admin)) {
        entry.grant()
        return
      }

      if (waiting.length >= 128) {
        reject(new AppError(503, 'Request queue is full. Retry shortly.', 1))
        return
      }

      waiting.push(entry)
      timer = setTimeout(() => {
        const index = waiting.indexOf(entry)

        if (index < 0) return

        waiting.splice(index, 1)
        reject(new AppError(503, 'Request capacity is busy. Retry shortly.', 1))
      }, timeout)
    })
  }
}
