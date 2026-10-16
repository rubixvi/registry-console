import readline from 'node:readline'

export async function readSecret(prompt) {
  const input = process.stdin
  const output = process.stderr

  if (!input.isTTY) {
    const chunks = []

    for await (const chunk of input) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }

    return Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '')
  }

  output.write(prompt)
  readline.emitKeypressEvents(input)

  const wasRaw = input.isRaw
  input.setRawMode(true)

  return new Promise((resolve, reject) => {
    let value = ''

    function cleanup() {
      input.removeListener('keypress', handleKeypress)
      input.removeListener('error', handleError)
      input.removeListener('end', handleEnd)
      input.setRawMode(wasRaw)
      input.pause()
      output.write('\n')
    }

    function handleError(error) {
      cleanup()
      reject(error)
    }

    function handleEnd() {
      cleanup()
      reject(new Error('Input ended.'))
    }

    function handleKeypress(text, key = {}) {
      if (key.ctrl && key.name === 'c') {
        cleanup()
        reject(new Error('Cancelled'))
        return
      }

      if (key.name === 'return' || key.name === 'enter') {
        cleanup()
        resolve(value)
        return
      }

      if (key.name === 'backspace') {
        const characters = Array.from(value)
        characters.pop()
        value = characters.join('')
        return
      }

      const control = Array.from(text ?? '').some((character) => {
        const code = character.codePointAt(0)

        return code < 32 || code === 127
      })

      if (text && !key.ctrl && !key.meta && !control) {
        value += text
      }
    }

    input.on('keypress', handleKeypress)
    input.once('error', handleError)
    input.once('end', handleEnd)
    input.resume()
  })
}
