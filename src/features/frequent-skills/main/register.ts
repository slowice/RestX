import path from 'node:path'
import { dialog, shell } from 'electron'
import { aiProviderRegistry } from '../../../platform/ai-provider/main/provider-registry'
import { defineMainFeature } from '../../../platform/main/define-feature'
import { getRestxStorageLayout } from '../../../platform/main/storage'
import type { FrequentSkillDraft, FrequentSkillsErrorCode, FrequentSkillsResult, UpdateFrequentSkillInput } from '../shared/contracts'
import { frequentSkillsChannels as channels } from '../shared/channels'
import { FrequentSkillsService } from './frequent-skills-service'
import { FrequentSkillsError } from './services/frequent-skills-error'
import { SkillStore } from './services/skill-store'

function skillsRoot(): string {
  const developmentRoot = process.env.NODE_ENV === 'development'
    ? process.env.RESTX_SKILLS_ROOT?.trim()
    : undefined
  return developmentRoot && path.isAbsolute(developmentRoot)
    ? path.resolve(developmentRoot)
    : path.join(getRestxStorageLayout().root, 'skills')
}

const frequentSkillsService = new FrequentSkillsService({
  store: new SkillStore(skillsRoot()),
  chooseImportFile: async () => {
    const result = await dialog.showOpenDialog({
      title: '导入 RestX Skill',
      properties: ['openFile'],
      filters: [{ name: 'RestX Skill', extensions: ['md'] }]
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  },
  trashItem: (target) => shell.trashItem(target),
  executeActive: (operation) => aiProviderRegistry.executeActive(operation)
})

function assertId(value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new FrequentSkillsError('INVALID_INPUT', 'Skill 标识无效。')
}

function assertDraft(value: unknown): asserts value is FrequentSkillDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FrequentSkillsError('INVALID_INPUT', 'Skill 参数无效。')
  }
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || typeof record.description !== 'string' || typeof record.prompt !== 'string') {
    throw new FrequentSkillsError('INVALID_INPUT', 'Skill 参数无效。')
  }
}

function assertUpdate(value: unknown): asserts value is UpdateFrequentSkillInput {
  assertDraft(value)
  assertId((value as unknown as Record<string, unknown>).id)
}

function safeError(reason: unknown, fallback: FrequentSkillsErrorCode): { code: FrequentSkillsErrorCode; message: string } {
  return reason instanceof FrequentSkillsError
    ? { code: reason.code, message: reason.message }
    : { code: fallback, message: fallback === 'EXECUTION_FAILED' ? 'Skill 执行失败，请稍后重试。' : 'Skill 操作失败，请稍后重试。' }
}

async function result<T>(operation: () => Promise<T>, fallback: FrequentSkillsErrorCode = 'STORAGE_FAILED'): Promise<FrequentSkillsResult<T>> {
  try {
    return { ok: true, data: await operation() }
  } catch (reason) {
    return { ok: false, error: safeError(reason, fallback) }
  }
}

export const frequentSkillsMainFeature = defineMainFeature({
  id: 'frequent-skills',
  provides: ['frequent-skills.main'],
  channels: Object.values(channels),
  register({ ipc }) {
    ipc.handle(channels.list, () => result(() => frequentSkillsService.list()))
    ipc.handle(channels.create, (_event, input: unknown) => result(async () => {
      assertDraft(input)
      return frequentSkillsService.create(input)
    }))
    ipc.handle(channels.update, (_event, input: unknown) => result(async () => {
      assertUpdate(input)
      return frequentSkillsService.update(input.id, input)
    }))
    ipc.handle(channels.delete, (_event, id: unknown) => result(async () => {
      assertId(id)
      await frequentSkillsService.delete(id)
    }))
    ipc.handle(channels.import, () => result(() => frequentSkillsService.importSkill()))
    ipc.handle(channels.execute, (_event, id: unknown) => result(async () => {
      assertId(id)
      return frequentSkillsService.execute(id)
    }, 'EXECUTION_FAILED'))
  }
})
