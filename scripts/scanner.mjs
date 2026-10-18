import { createScanner } from './helpers/scanner-server.mjs'

if (process.getuid?.() === 0) throw new Error('Run the scanner as its isolated non-root user.')

createScanner().listen(
  Number(process.env.SCANNER_PORT || 3001),
  process.env.SCANNER_HOST || '0.0.0.0'
)
