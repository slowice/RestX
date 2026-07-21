import { app, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import type { AnalyzeConfigInput, AiProviderSettingsInput } from '../../shared/contracts/ai-capability'
import type { JsonlEntryRequest, JsonlPageRequest } from '../../shared/contracts/jsonl'
import type { SaveUserPresetInput, SmartPresetDraftRequest } from '../../shared/contracts/smart-import'
import { authorizedPaths } from '../services/authorized-paths'
import { aiCallLogger, ensureAiLogDirectory } from '../services/ai-call-logger'
import { getPersistentAnalysisCache } from '../services/analysis-cache'
import { ConfigAnalysisService } from '../services/config-analysis-service'
import { readConfigDocument } from '../services/config-reader'
import { openClawRuntime } from '../services/openclaw-runtime'
import { analyzeWithOpenAiCompatible } from '../services/openai-provider'
import { preferences } from '../services/preferences'
import { providerSettings } from '../services/provider-settings'
import { scanDirectory } from '../services/file-scanner'
import { readJsonlEntry, readJsonlPage } from '../services/jsonl-browser'
import { generateSmartPresetDraft } from '../services/smart-preset-import'
import { refreshAiToolPresetRegistry, userPresetStore } from '../services/user-preset-store'

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32_768) {
    throw new Error(`${name} 参数无效。`)
  }
}

function assertProviderInput(value: unknown): asserts value is AiProviderSettingsInput {
  if (!value || typeof value !== 'object') throw new Error('AI 服务配置无效。')
  const input = value as Record<string, unknown>
  assertString(input.baseUrl, 'baseUrl')
  assertString(input.model, 'model')
  if (input.apiKey !== undefined && typeof input.apiKey !== 'string') throw new Error('apiKey 参数无效。')
  if (input.clearApiKey !== undefined && typeof input.clearApiKey !== 'boolean') throw new Error('clearApiKey 参数无效。')
}

function assertJsonlPageRequest(value: unknown): asserts value is JsonlPageRequest {
  if (!value || typeof value !== 'object') throw new Error('JSONL 分页请求无效。')
  const input = value as Record<string, unknown>
  assertString(input.path, 'path')
  assertString(input.profileId, 'profileId')
  if (input.cursor !== undefined && (typeof input.cursor !== 'string' || !/^\d+$/.test(input.cursor))) throw new Error('cursor 参数无效。')
  if (input.snapshotId !== undefined && typeof input.snapshotId !== 'string') throw new Error('snapshotId 参数无效。')
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > 200)) throw new Error('limit 参数无效。')
}

function assertJsonlEntryRequest(value: unknown): asserts value is JsonlEntryRequest {
  if (!value || typeof value !== 'object') throw new Error('JSONL 记录请求无效。')
  const input = value as Record<string, unknown>
  assertString(input.path, 'path')
  assertString(input.profileId, 'profileId')
  assertString(input.offset, 'offset')
  assertString(input.snapshotId, 'snapshotId')
  if (!/^\d+$/.test(input.offset as string) || !Number.isInteger(input.byteLength) || (input.byteLength as number) < 0) throw new Error('记录位置参数无效。')
}

function assertSmartPresetRequest(value: unknown): asserts value is SmartPresetDraftRequest {
  if (!value || typeof value !== 'object') throw new Error('智能导入请求无效。')
  const input = value as Record<string, unknown>
  assertString(input.toolName, 'toolName')
  assertString(input.rootPath, 'rootPath')
  if (typeof input.knownPaths !== 'string' || typeof input.notes !== 'string' || typeof input.metadataConsent !== 'boolean') throw new Error('智能导入参数无效。')
}

function assertPresetId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error('预置 id 无效。')
}

const analysisService = new ConfigAnalysisService({
  cache: getPersistentAnalysisCache(),
  readDocument: readConfigDocument,
  getProviderPublic: () => providerSettings.getPublic(),
  getProviderSecret: () => providerSettings.getSecret(),
  isConsentEnabled: () => preferences.get().aiLocalAnalysisEnabled,
  analyzeProvider: (settings, document) => analyzeWithOpenAiCompatible({ settings, document, logger: aiCallLogger })
})

export async function registerIpcHandlers(): Promise<void> {
  await ensureAiLogDirectory().catch(() => undefined)
  const recent = preferences.get().recentDirectory
  if (recent) await authorizedPaths.authorize(recent).catch(() => undefined)

  ipcMain.handle('inspector:choose-directory', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择要检查的文件夹',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const selected = await authorizedPaths.authorize(result.filePaths[0])
    preferences.setRecentDirectory(selected)
    return selected
  })

  ipcMain.handle('inspector:scan-directory', async (_event, directory: unknown) => {
    assertString(directory, 'directory')
    const normalized = await authorizedPaths.assertAuthorized(directory)
    return scanDirectory(normalized)
  })

  ipcMain.handle('inspector:read-config', async (_event, filePath: unknown) => {
    assertString(filePath, 'filePath')
    await authorizedPaths.assertAuthorized(filePath)
    return readConfigDocument(filePath)
  })

  ipcMain.handle('inspector:read-jsonl-page', async (_event, input: unknown) => {
    assertJsonlPageRequest(input)
    await authorizedPaths.assertAuthorized(input.path)
    return readJsonlPage(input)
  })

  ipcMain.handle('inspector:read-jsonl-entry', async (_event, input: unknown) => {
    assertJsonlEntryRequest(input)
    await authorizedPaths.assertAuthorized(input.path)
    return readJsonlEntry(input)
  })

  ipcMain.handle('inspector:reveal-in-folder', async (_event, filePath: unknown) => {
    assertString(filePath, 'filePath')
    await authorizedPaths.assertAuthorized(filePath)
    shell.showItemInFolder(path.resolve(filePath))
  })

  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:get-preferences', () => preferences.get())
  ipcMain.handle('app:set-ai-local-analysis-enabled', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('enabled 参数无效。')
    return preferences.setAiLocalAnalysisEnabled(enabled)
  })
  ipcMain.handle('app:clear-history', () => {
    authorizedPaths.clear()
    return preferences.clearHistory()
  })
  ipcMain.handle('ai:get-runtime-status', () => openClawRuntime.getStatus())
  ipcMain.handle('ai:get-provider-settings', () => providerSettings.getPublic())
  ipcMain.handle('ai:update-provider-settings', (_event, input: unknown) => {
    assertProviderInput(input)
    return providerSettings.update(input)
  })
  ipcMain.handle('ai:analyze-config', async (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('分析请求无效。')
    const request = input as Partial<AnalyzeConfigInput>
    assertString(request.path, 'path')
    if (request.force !== undefined && typeof request.force !== 'boolean') throw new Error('force 参数无效。')
    await authorizedPaths.assertAuthorized(request.path)
    return analysisService.analyze(request.path, request.force)
  })
  ipcMain.handle('ai:get-cached-analysis', async (_event, filePath: unknown) => {
    assertString(filePath, 'filePath')
    await authorizedPaths.assertAuthorized(filePath)
    return analysisService.getCached(filePath)
  })
  ipcMain.handle('ai:clear-analysis-cache', () => ({ cleared: getPersistentAnalysisCache().clear() }))

  ipcMain.handle('presets:list', async () => (await refreshAiToolPresetRegistry()).summaries)
  ipcMain.handle('presets:generate-draft', async (_event, input: unknown) => {
    assertSmartPresetRequest(input)
    input.rootPath = await authorizedPaths.assertAuthorized(input.rootPath)
    return generateSmartPresetDraft(input)
  })
  ipcMain.handle('presets:save', async (_event, input: unknown) => {
    if (!input || typeof input !== 'object' || !('preset' in input)) throw new Error('保存预置请求无效。')
    const request = input as SaveUserPresetInput
    if (request.overwrite !== undefined && typeof request.overwrite !== 'boolean') throw new Error('overwrite 参数无效。')
    const summary = await userPresetStore.save(request.preset, request.overwrite)
    await refreshAiToolPresetRegistry()
    return summary
  })
  ipcMain.handle('presets:set-enabled', async (_event, id: unknown, enabled: unknown) => {
    assertPresetId(id)
    if (typeof enabled !== 'boolean') throw new Error('enabled 参数无效。')
    await userPresetStore.setEnabled(id, enabled)
    return (await refreshAiToolPresetRegistry()).summaries
  })
  ipcMain.handle('presets:delete', async (_event, id: unknown) => {
    assertPresetId(id)
    await userPresetStore.delete(id)
    return (await refreshAiToolPresetRegistry()).summaries
  })
}
