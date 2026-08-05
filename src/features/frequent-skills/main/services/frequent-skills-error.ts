import type { FrequentSkillsErrorCode } from '../../shared/contracts'

export class FrequentSkillsError extends Error {
  constructor(readonly code: FrequentSkillsErrorCode, message: string) {
    super(message)
    this.name = 'FrequentSkillsError'
  }
}
