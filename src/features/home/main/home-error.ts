export type HomeErrorCode =
  | 'INVALID_INPUT'
  | 'SECURE_STORAGE_UNAVAILABLE'
  | 'CREDENTIAL_SAVE_FAILED'
  | 'TASK_READ_FAILED'
  | 'TASK_SAVE_FAILED'

export class HomeError extends Error {
  constructor(readonly code: HomeErrorCode, message: string) {
    super(message)
    this.name = 'HomeError'
  }
}
