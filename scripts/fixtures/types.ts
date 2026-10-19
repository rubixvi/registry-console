import { type TestContext } from 'node:test'

import { type virtualPasskey } from '../../tests/fixtures/passkey'
import { type Integration, type TestRequest } from '../helpers/types'
import { type mockBrowsing } from './mock-browsing'
import { type mockConsole } from './mock-console'
import { type mockRegistry } from './mock-registry'

export type CheckProps = {
  context: TestContext
  request: TestRequest
}

export type FixtureProps<T> = CheckProps & {
  readerCookie: string
  fixture: T
}

export type AccessProps = CheckProps & {
  password: string
}

export type ApplicationProps = CheckProps & {
  readerCookie: string
  server: Integration
}

export type Credentials = {
  username: string
  password: string
}

export type Account = {
  request: TestRequest
  credentials: Credentials
}

export type Passkey = {
  device: ReturnType<typeof virtualPasskey>
  handle: string
}

export type Authenticator = {
  secret: string
  step: number
  recovery: string[]
}

export type AuthenticationProps = {
  base: string
  origin: string
  password: string
}

export type PasskeySignIn = {
  request: TestRequest
  origin: string
  passkey: Passkey
  verified: boolean
}

export type PasskeyAccess = AuthenticationProps & {
  request: TestRequest
  jar: Map<string, string>
  passkey: Passkey
  authenticator: Authenticator
}

export type AuditProps = {
  context: TestContext
  directory: string
  password: string
}

export type BrowsingProps = FixtureProps<BrowsingFixture>
export type ConsoleProps = FixtureProps<ConsoleFixture>

export type RegistryProps = FixtureProps<RegistryFixture> & {
  api: string
}

export type DeletionProps = CheckProps & {
  api: string
  digest: string
}

export type LimitProps = CheckProps & AuthenticationProps

export type VisibilityProps = CheckProps & {
  viewerCookie: string
  privateApi: string
  digest: string
  publicOrigin: string
}

export type BrowsingFixture = Awaited<ReturnType<typeof mockBrowsing>>
export type ConsoleFixture = Awaited<ReturnType<typeof mockConsole>>
export type RegistryFixture = Awaited<ReturnType<typeof mockRegistry>>
