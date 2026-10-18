export function scanInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid scan input.')

  const keys = [
    'origin',
    'repository',
    'digest',
    'platform',
    'provider',
    'username',
    'password',
    'timeout',
  ]

  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => key !== 'timeout' && typeof value[key] !== 'string')
  ) {
    throw new Error('Invalid scan fields.')
  }

  const origin = new URL(value.origin)
  const allowed = (process.env.REGISTRY_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim())
  const timeout = Number(process.env.TRIVY_TIMEOUT_SECONDS || 180) * 1000

  if (!Number.isInteger(timeout) || timeout < 30_000 || timeout > 600_000) {
    throw new Error('Invalid scanner timeout configuration.')
  }

  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.origin !== value.origin ||
    origin.username ||
    origin.password ||
    (origin.protocol === 'http:' && process.env.ALLOW_HTTP_REGISTRIES !== 'true') ||
    (!allowed.includes(origin.origin) && origin.origin !== 'https://registry-1.docker.io')
  ) {
    throw new Error('Registry origin is not approved for scanning.')
  }

  if (
    value.repository.length > 255 ||
    !/^[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*)*$/.test(
      value.repository
    ) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.digest) ||
    (value.platform !== 'Not provided' &&
      !/^[a-z0-9_-]+\/[a-z0-9_-]+(?:\/[a-z0-9_.-]+)?$/.test(value.platform)) ||
    !['distribution', 'dockerhub'].includes(value.provider) ||
    (value.provider === 'dockerhub' && origin.origin !== 'https://registry-1.docker.io') ||
    value.username.length > 128 ||
    /[:\r\n]/.test(value.username) ||
    value.password.length > 4096 ||
    !Number.isInteger(value.timeout) ||
    value.timeout < 1 ||
    value.timeout > Math.min(timeout, 600_000)
  ) {
    throw new Error('Invalid image scan target.')
  }

  return value
}
