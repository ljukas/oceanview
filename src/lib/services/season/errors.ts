export type SeasonDomainErrorCode = 'ALREADY_EXISTS' | 'NOT_FOUND'

export class SeasonDomainError extends Error {
  constructor(public readonly code: SeasonDomainErrorCode) {
    super(code)
    this.name = 'SeasonDomainError'
  }
}
