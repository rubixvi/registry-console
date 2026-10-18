import 'server-only'

export const globals = globalThis as typeof globalThis & {
  registryConsoleBackoffs?: Map<string, number>
}

export const backoffs = globals.registryConsoleBackoffs ?? new Map<string, number>()

globals.registryConsoleBackoffs = backoffs
