import { type Server } from 'node:net'

export function listen(server: Server): Promise<number>
export function close(server: Server): Promise<void>
export function availablePort(): Promise<number>
