import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'

import { createScanner } from '../../scripts/helpers/scanner-server.mjs'

const spawn = childProcess.spawn

childProcess.spawn = (command, args, options) =>
  command === process.env.TRIVY_PATH
    ? spawn(process.execPath, [command, ...args], options)
    : spawn(command, args, options)

syncBuiltinESMExports()

createScanner().listen(Number(process.env.SCANNER_PORT), '127.0.0.1')
