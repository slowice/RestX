import type { AiAnalysisResponse, AnalyzeConfigInput, CachedAnalysisResponse } from './contracts/ai-capability'
import type { ConfigDocument } from './contracts/config'
import type { ScanResult } from './contracts/inspector'
import type { JsonlEntryDetail, JsonlEntryRequest, JsonlPage, JsonlPageRequest, JsonlWorkspaceSearchRequest, JsonlWorkspaceSearchResult } from './contracts/jsonl'
import type { SaveUserPresetInput, SmartPresetDraft, SmartPresetDraftRequest, UserPresetSummary } from './contracts/smart-import'

export type AppPreferences = {
  recentDirectory: string | null
  aiLocalAnalysisEnabled: boolean
}

export type AiInspectorApi = {
  inspector: {
    chooseDirectory(): Promise<string | null>
    scanDirectory(path: string): Promise<ScanResult>
    readConfig(path: string): Promise<ConfigDocument>
    readJsonlPage(input: JsonlPageRequest): Promise<JsonlPage>
    readJsonlEntry(input: JsonlEntryRequest): Promise<JsonlEntryDetail>
    searchJsonlWorkspace(input: JsonlWorkspaceSearchRequest): Promise<JsonlWorkspaceSearchResult>
    revealInFolder(path: string): Promise<void>
  }
  app: {
    getPreferences(): Promise<AppPreferences>
    setAiLocalAnalysisEnabled(enabled: boolean): Promise<AppPreferences>
    clearHistory(): Promise<AppPreferences>
  }
  ai: {
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
