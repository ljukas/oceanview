export type ShareDomainErrorCode =
  | 'USER_NOT_FOUND'
  | 'ALREADY_CURRENT_OWNER'
  | 'FROM_DATE_NOT_AFTER_CURRENT'
  | 'NOT_ASSIGNED'
  | 'DATE_NOT_AFTER_CURRENT'
  | 'LEAVES_USER_WITH_ONLY_HALVES'

export class ShareDomainError extends Error {
  constructor(public readonly code: ShareDomainErrorCode) {
    super(code)
    this.name = 'ShareDomainError'
  }
}
