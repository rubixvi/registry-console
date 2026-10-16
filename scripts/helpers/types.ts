import { type startIntegration } from './integration'
import { type createRequest } from './testing'

export type InspectionProps = {
  server: Integration
  cookie: string
  id: string
}

export type RequestProps = {
  base: string
  origin: string
  method?: string
  cookie?: string
  jar?: Map<string, string>
}

export type RequestOptions = {
  method?: string
  body?: unknown
  cookie?: string
  origin?: string
  fresh?: boolean
}

export type SignInProps = {
  request: TestRequest
  username: string
  password: string
}

export type Integration = Awaited<ReturnType<typeof startIntegration>>
export type TestRequest = ReturnType<typeof createRequest>
