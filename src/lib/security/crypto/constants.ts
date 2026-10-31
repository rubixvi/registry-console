import 'server-only'

export const ALGORITHM = 'aes-256-gcm'
export const VERSION = 'v2'
export const IV_PATTERN = /^[a-f0-9]{24}$/
export const TAG_PATTERN = /^[a-f0-9]{32}$/
export const DATA_PATTERN = /^(?:[a-f0-9]{2})+$/
