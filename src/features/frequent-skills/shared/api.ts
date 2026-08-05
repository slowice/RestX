import type {
  FrequentSkill,
  FrequentSkillDraft,
  FrequentSkillExecutionResult,
  FrequentSkillImportResult,
  FrequentSkillList,
  FrequentSkillsResult,
  UpdateFrequentSkillInput
} from './contracts'

export type FrequentSkillsApi = {
  frequentSkills: {
    list(): Promise<FrequentSkillsResult<FrequentSkillList>>
    create(input: FrequentSkillDraft): Promise<FrequentSkillsResult<FrequentSkill>>
    update(input: UpdateFrequentSkillInput): Promise<FrequentSkillsResult<FrequentSkill>>
    delete(id: string): Promise<FrequentSkillsResult<void>>
    importSkill(): Promise<FrequentSkillsResult<FrequentSkillImportResult>>
    execute(id: string): Promise<FrequentSkillsResult<FrequentSkillExecutionResult>>
  }
}
