import path from 'node:path'
import { shell } from 'electron'
import { aiProviderRegistry } from '../../../platform/ai-provider/main/provider-registry'
import { defineMainFeature } from '../../../platform/main/define-feature'
import { getRestxStorageLayout } from '../../../platform/main/storage'
import type { ApplyKnowledgeClassificationInput } from '../shared/contracts'
import { knowledgeMapChannels as channels } from '../shared/channels'
import { KnowledgeService } from './knowledge-service'

const knowledgeService = new KnowledgeService({
  root: path.join(getRestxStorageLayout().root, 'knowledge'),
  openPath: (target) => shell.openPath(target),
  executeActive: (operation) => aiProviderRegistry.executeActive(operation)
})

function assertProblemId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 2_000 || value.includes('\0')) {
    throw new Error('问题标识无效。')
  }
}

function assertApplyInput(value: unknown): asserts value is ApplyKnowledgeClassificationInput {
  if (!value || typeof value !== 'object') throw new Error('问题分类参数无效。')
  const input = value as Record<string, unknown>
  assertProblemId(input.problemId)
  if (typeof input.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(input.sourceFingerprint)) {
    throw new Error('问题版本标识无效。')
  }
  if (typeof input.scene !== 'string') throw new Error('场景参数无效。')
  if (!Array.isArray(input.capabilities) || !Array.isArray(input.knowledge)) throw new Error('能力或知识参数无效。')
}

export const knowledgeMapMainFeature = defineMainFeature({
  id: 'knowledge-map',
  provides: ['knowledge-map.main'],
  channels: Object.values(channels),
  register({ ipc }) {
    ipc.handle(channels.scan, () => knowledgeService.scan())
    ipc.handle(channels.read, (_event, problemId: unknown) => {
      assertProblemId(problemId)
      return knowledgeService.read(problemId)
    })
    ipc.handle(channels.classify, (_event, problemId: unknown) => {
      assertProblemId(problemId)
      return knowledgeService.classify(problemId)
    })
    ipc.handle(channels.apply, (_event, input: unknown) => {
      assertApplyInput(input)
      return knowledgeService.apply(input)
    })
    ipc.handle(channels.open, (_event, problemId: unknown) => {
      assertProblemId(problemId)
      return knowledgeService.open(problemId)
    })
    ipc.handle(channels.openRoot, () => knowledgeService.openRoot())
  }
})

