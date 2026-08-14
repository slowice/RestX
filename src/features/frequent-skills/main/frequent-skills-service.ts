import { lstat, readFile } from 'node:fs/promises'
import type { AiProviderExecutionContext } from '../../../platform/ai-provider/shared/contracts'
import {
  MAX_SKILL_FILE_BYTES,
  type FrequentSkill,
  type FrequentSkillDraft,
  type FrequentSkillExecutionResult,
  type FrequentSkillImportResult,
  type FrequentSkillList
} from '../shared/contracts'
import { FrequentSkillsError } from './services/frequent-skills-error'
import { executeSkillPrompt } from './services/skill-executor'
import { analyzeSkillImportMetadata } from './services/skill-import-analyzer'
import { extractFallbackDraft, readMarkdownSource } from './services/skill-import-source'
import { parseSkillMarkdown } from './services/skill-markdown'
import { SkillStore } from './services/skill-store'

type ExecuteActive = <T>(operation: (context: AiProviderExecutionContext) => Promise<T>) => Promise<T>

export type FrequentSkillsServiceDependencies = {
  store: SkillStore
  chooseImportFile: () => Promise<string | null>
  trashItem: (target: string) => Promise<void>
  executeActive: ExecuteActive
  now?: () => Date
}

function isProviderConfigurationError(reason: unknown): boolean {
  return Boolean(reason && typeof reason === 'object' && 'code' in reason && (reason as { code?: unknown }).code === 'INVALID_SETTINGS')
}

export class FrequentSkillsService {
  private executing = false
  private importing = false
  private readonly now: () => Date

  constructor(private readonly dependencies: FrequentSkillsServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date())
  }

  list(): Promise<FrequentSkillList> {
    return this.dependencies.store.list()
  }

  create(input: FrequentSkillDraft): Promise<FrequentSkill> {
    return this.dependencies.store.create(input)
  }

  update(id: string, input: FrequentSkillDraft): Promise<FrequentSkill> {
    return this.dependencies.store.update(id, input)
  }

  async delete(id: string): Promise<void> {
    const directory = await this.dependencies.store.directoryForDelete(id)
    try {
      await this.dependencies.trashItem(directory)
    } catch {
      throw new FrequentSkillsError('STORAGE_FAILED', '无法将 Skill 移入废纸篓。')
    }
  }

  async importSkill(): Promise<FrequentSkillImportResult> {
    if (this.importing) throw new FrequentSkillsError('IMPORT_IN_PROGRESS', '已有 Skill 正在导入，请稍候。')
    this.importing = true
    try {
      const selected = await this.dependencies.chooseImportFile()
      if (!selected) return { cancelled: true }
      const stat = await lstat(selected)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SKILL_FILE_BYTES) {
        throw new FrequentSkillsError('INVALID_SKILL_FILE', 'Skill 文件格式无效。')
      }
      const sourceText = readMarkdownSource(await readFile(selected), selected)
      try {
        const source = parseSkillMarkdown(sourceText)
        return {
          cancelled: false,
          skill: await this.dependencies.store.importSkill(source),
          analysis: { method: 'direct' }
        }
      } catch {
        const fallback = extractFallbackDraft(sourceText, selected)
        let metadata
        try {
          metadata = await this.dependencies.executeActive((context) => analyzeSkillImportMetadata(fallback.prompt, context))
        } catch {
          return {
            cancelled: false,
            skill: await this.dependencies.store.create(fallback),
            analysis: { method: 'fallback', warning: '智能分析未完成，已使用文件中的本地信息导入。' }
          }
        }
        return {
          cancelled: false,
          skill: await this.dependencies.store.create({ ...fallback, name: metadata.name, description: metadata.description }),
          analysis: { method: 'ai', detectedFormat: metadata.detectedFormat }
        }
      }
    } catch (reason) {
      if (reason instanceof FrequentSkillsError) throw reason
      throw new FrequentSkillsError('INVALID_SKILL_FILE', '无法导入该 Skill 文件。')
    } finally {
      this.importing = false
    }
  }

  async execute(id: string): Promise<FrequentSkillExecutionResult> {
    if (this.executing) throw new FrequentSkillsError('EXECUTION_IN_PROGRESS', '已有 Skill 正在执行，请稍候。')
    this.executing = true
    try {
      const skill = await this.dependencies.store.get(id)
      const text = await this.dependencies.executeActive((context) => executeSkillPrompt(skill.prompt, context))
      return {
        skillId: skill.id,
        skillName: skill.name,
        text,
        completedAt: this.now().toISOString()
      }
    } catch (reason) {
      if (reason instanceof FrequentSkillsError) throw reason
      if (isProviderConfigurationError(reason)) {
        throw new FrequentSkillsError('PROVIDER_NOT_CONFIGURED', '请先在设置中新增并启用一个 AI Provider。')
      }
      throw new FrequentSkillsError('EXECUTION_FAILED', 'Skill 执行失败，请检查 AI Provider 后重试。')
    } finally {
      this.executing = false
    }
  }
}
