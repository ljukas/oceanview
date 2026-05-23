export type FileDomainErrorCode =
  | 'NOT_FOUND'
  | 'CANNOT_DELETE_OTHERS_FILE'
  | 'CANNOT_DELETE_AVATAR_VIA_DOCUMENT_DELETE'

export class FileDomainError extends Error {
  constructor(public readonly code: FileDomainErrorCode) {
    super(code)
    this.name = 'FileDomainError'
  }
}
