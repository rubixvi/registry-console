import 'server-only'

export const worker = globalThis as typeof globalThis & {
  trivyTimer?: ReturnType<typeof setTimeout>
}
