export const SKILL_SCHEMA_VERSION = 1 as const
export const MAX_SKILL_NAME_CHARS = 80
export const MAX_SKILL_DESCRIPTION_CHARS = 300
export const MAX_SKILL_PROMPT_CHARS = 64_000
export const MAX_SKILL_FILE_BYTES = 128 * 1024
export const MAX_SKILL_RESULT_CHARS = 200_000

export type FrequentSkill = {
  schemaVersion: typeof SKILL_SCHEMA_VERSION
  id: string
  name: string
  description: string
  prompt: string
  createdAt: string
  updatedAt: string
}

export type FrequentSkillDraft = {
  name: string
  description: string
  prompt: string
}

export type UpdateFrequentSkillInput = FrequentSkillDraft & {
  id: string
}

export type FrequentSkillList = {
  skills: FrequentSkill[]
  invalidCount: number
}

export type FrequentSkillImportResult = {
  cancelled: boolean
  skill?: FrequentSkill
}

export type FrequentSkillExecutionResult = {
  skillId: string
  skillName: string
  text: string
  completedAt: string
}

export type FrequentSkillsErrorCode =
  | 'INVALID_INPUT'
  | 'SKILL_NOT_FOUND'
  | 'INVALID_SKILL_FILE'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'EXECUTION_IN_PROGRESS'
  | 'EXECUTION_FAILED'
  | 'STORAGE_FAILED'

export type FrequentSkillsApiError = {
  code: FrequentSkillsErrorCode
  message: string
}

export type FrequentSkillsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: FrequentSkillsApiError }
