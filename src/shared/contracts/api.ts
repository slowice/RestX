import type { AiAnalysisResponse, AiProviderPublicSettings, AiProviderSettingsInput, AnalyzeConfigInput, CachedAnalysisResponse, RuntimeStatus } from './ai-capability'
import type { ConfigDocument } from './config'
import type { ScanResult } from './inspector'
import type { JsonlEntryDetail, JsonlEntryRequest, JsonlPage, JsonlPageRequest } from './jsonl'
import type { SaveUserPresetInput, SmartPresetDraft, SmartPresetDraftRequest, UserPresetSummary } from './smart-import'

export type AppPreferences = {
  recentDirectory: string | null
  aiLocalAnalysisEnabled: boolean
}

export type RestXApi = {
  inspector: {
    chooseDirectory(): Promise<string | null>
    scanDirectory(path: string): Promise<ScanResult>
    readConfig(path: string): Promise<ConfigDocument>
    readJsonlPage(input: JsonlPageRequest): Promise<JsonlPage>
    readJsonlEntry(input: JsonlEntryRequest): Promise<JsonlEntryDetail>
    revealInFolder(path: string): Promise<void>
  }
  app: {
    getVersion(): Promise<string>
    getPreferences(): Promise<AppPreferences>
    setAiLocalAnalysisEnabled(enabled: boolean): Promise<AppPreferences>
    clearHistory(): Promise<AppPreferences>
  }
  ai: {
    getRuntimeStatus(): Promise<RuntimeStatus>
    getProviderSettings(): Promise<AiProviderPublicSettings>
    updateProviderSettings(input: AiProviderSettingsInput): Promise<AiProviderPublicSettings>
    analyzeConfig(input: AnalyzeConfigInput): Promise<AiAnalysisResponse>
    getCachedAnalysis(path: string): Promise<CachedAnalysisResponse>
    clearAnalysisCache(): Promise<{ cleared: number }>
  }
  presets: {
    list(): Promise<UserPresetSummary[]>
    generateDraft(input: SmartPresetDraftRequest): Promise<SmartPresetDraft>
    save(input: SaveUserPresetInput): Promise<UserPresetSummary>
    setEnabled(id: string, enabled: boolean): Promise<UserPresetSummary[]>
    delete(id: string): Promise<UserPresetSummary[]>
  }
}
