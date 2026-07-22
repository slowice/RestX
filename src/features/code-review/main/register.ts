import type {
  GitCodeSettingsInput,
  PreviewReviewSourceInput,
  ReviewProviderSettingsInput,
  ReviewZone,
  RunCodeReviewInput,
  UpdateZoneProviderInput
} from '../shared/contracts/code-review'
import { codeReviewChannels as channels } from '../shared/channels'
import { defineMainFeature } from '../../../platform/main/define-feature'
import { getCodeReviewCache } from './services/code-review-cache'
import { codeReviewService } from './services/code-review-service'
import { gitCodeSettings } from './services/gitcode-settings'
import { reviewZoneSettings } from './services/review-zone-settings'

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32_768) throw new Error(`${name} 参数无效。`)
}

function assertZone(value: unknown): asserts value is ReviewZone {
  if (value !== 'blue' && value !== 'yellow') throw new Error('网络区域无效。')
}

function assertPreviewInput(value: unknown): asserts value is PreviewReviewSourceInput {
  if (!value || typeof value !== 'object') throw new Error('代码来源请求无效。')
  const input = value as Record<string, unknown>
  assertString(input.url, 'url')
  if ((input.url as string).length > 4_096) throw new Error('MR/PR 链接过长。')
  assertZone(input.zone)
}

function assertRunInput(value: unknown): asserts value is RunCodeReviewInput {
  assertPreviewInput(value)
  const input = value as unknown as Record<string, unknown>
  if (input.requirements !== undefined && (typeof input.requirements !== 'string' || input.requirements.length > 8_000)) throw new Error('补充检视要求无效。')
  if (input.force !== undefined && typeof input.force !== 'boolean') throw new Error('force 参数无效。')
}

function assertGitCodeSettings(value: unknown): asserts value is GitCodeSettingsInput {
  if (!value || typeof value !== 'object') throw new Error('GitCode 配置无效。')
  const input = value as Record<string, unknown>
  if (input.accessToken !== undefined && (typeof input.accessToken !== 'string' || input.accessToken.length > 20_000)) throw new Error('GitCode PAT 无效。')
  if (input.clearAccessToken !== undefined && typeof input.clearAccessToken !== 'boolean') throw new Error('clearAccessToken 参数无效。')
}

function assertProviderSettings(value: unknown): asserts value is ReviewProviderSettingsInput {
  if (!value || typeof value !== 'object') throw new Error('区域 AI 配置无效。')
  const input = value as Record<string, unknown>
  assertString(input.baseUrl, 'baseUrl')
  assertString(input.model, 'model')
  if (input.apiKey !== undefined && typeof input.apiKey !== 'string') throw new Error('apiKey 参数无效。')
  if (input.clearApiKey !== undefined && typeof input.clearApiKey !== 'boolean') throw new Error('clearApiKey 参数无效。')
}

function assertZoneProviderInput(value: unknown): asserts value is UpdateZoneProviderInput {
  if (!value || typeof value !== 'object') throw new Error('区域 AI 配置无效。')
  const input = value as Record<string, unknown>
  assertZone(input.zone)
  assertProviderSettings(input.settings)
}

export const codeReviewMainFeature = defineMainFeature({
  id: 'code-review',
  provides: ['code-review.main'],
  channels: Object.values(channels),
  register({ ipc }) {
    ipc.handle(channels.listMyGitCodeMergeRequests, () => codeReviewService.listMyGitCodeMergeRequests())
    ipc.handle(channels.previewSource, async (_event, input: unknown) => {
      assertPreviewInput(input)
      return codeReviewService.preview(input)
    })
    ipc.handle(channels.run, async (_event, input: unknown) => {
      assertRunInput(input)
      return codeReviewService.run(input)
    })
    ipc.handle(channels.getGitCodeSettings, () => gitCodeSettings.getPublic())
    ipc.handle(channels.updateGitCodeSettings, (_event, input: unknown) => {
      assertGitCodeSettings(input)
      return gitCodeSettings.update(input)
    })
    ipc.handle(channels.testGitCodeConnection, () => codeReviewService.testGitCodeConnection())
    ipc.handle(channels.getZoneProviders, () => reviewZoneSettings.getAll())
    ipc.handle(channels.updateZoneProvider, (_event, input: unknown) => {
      assertZoneProviderInput(input)
      return reviewZoneSettings.update(input.zone, input.settings)
    })
    ipc.handle(channels.clearCache, () => ({ cleared: getCodeReviewCache().clear() }))
  }
})
