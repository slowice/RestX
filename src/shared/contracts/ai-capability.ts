export type RuntimeStatus = 'stopped' | 'starting' | 'ready' | 'error'

export type AiProviderPublicSettings = {
  provider: 'openai-compatible'
  baseUrl: string
  model: string
  apiKeyConfigured: boolean
}

export type AiProviderSettingsInput = {
  baseUrl: string
  model: string
  apiKey?: string
  clearApiKey?: boolean
}

export type AiAnalysisRisk = {
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  path?: string
}

export type AiAnalysisItem = {
  key: string
  explanation: string
  status?: 'ok' | 'attention' | 'unknown'
}

export type AiAnalysisSection = {
  title: string
  items: AiAnalysisItem[]
}

export type AiConfigAnalysis = {
  summary: string
  detectedTool: string | null
  sections: AiAnalysisSection[]
  risks: AiAnalysisRisk[]
  recommendations: string[]
}

export type AnalyzeConfigInput = {
  path: string
  force?: boolean
}

export type AiAnalysisRecord = {
  sourceHash: string
  analysisFingerprint: string
  model: string
  analyzedAt: string
  result: AiConfigAnalysis
}

export type AiAnalysisResponse = AiAnalysisRecord & {
  cacheStatus: 'hit' | 'miss' | 'refresh'
}

export type CachedAnalysisResponse = {
  status: 'none' | 'valid' | 'stale'
  record: AiAnalysisRecord | null
}
