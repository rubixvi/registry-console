export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter = 0
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
