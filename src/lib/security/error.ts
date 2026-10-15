export class AppError extends Error {
  public readonly status: number
  public readonly retryAfter?: number

  constructor(status: number, message: string, retryAfter?: number) {
    super(message)

    this.name = 'AppError'
    this.status = status
    this.retryAfter = retryAfter
  }
}
