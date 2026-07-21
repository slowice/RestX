import type { AiAnalysisResponse, AiConfigAnalysis, AiProviderPublicSettings, CachedAnalysisResponse } from '../../shared/contracts/ai-capability'
import type { ConfigDocument } from '../../shared/contracts/config'
import { AnalysisCache, createAnalysisFingerprint } from './analysis-cache'
import { ANALYSIS_PROMPT_VERSION, type ProviderSecretSettings } from './openai-provider'

export class ConfigAnalysisError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ConfigAnalysisError'
  }
}

type ConfigAnalysisDependencies = {
  cache: AnalysisCache
  readDocument(filePath: string): Promise<ConfigDocument>
  getProviderPublic(): AiProviderPublicSettings
  getProviderSecret(): ProviderSecretSettings
  isConsentEnabled(): boolean
  analyzeProvider(settings: ProviderSecretSettings, document: ConfigDocument): Promise<AiConfigAnalysis>
  now?: () => Date
}

export class ConfigAnalysisService {
  constructor(private readonly dependencies: ConfigAnalysisDependencies) {}

  private fingerprint(document: ConfigDocument): string {
    const settings = this.dependencies.getProviderPublic()
    return createAnalysisFingerprint({
      sourceHash: document.sourceHash,
      baseUrl: settings.baseUrl,
      model: settings.model,
      promptVersion: ANALYSIS_PROMPT_VERSION
    })
  }

  async getCached(filePath: string): Promise<CachedAnalysisResponse> {
    const document = await this.dependencies.readDocument(filePath)
    const settings = this.dependencies.getProviderPublic()
    if (!settings.model) return { status: 'none', record: null }
    return this.dependencies.cache.get(filePath, document.sourceHash, this.fingerprint(document))
  }

  async analyze(filePath: string, force = false): Promise<AiAnalysisResponse> {
    if (!this.dependencies.isConsentEnabled()) {
      throw new ConfigAnalysisError('请先在设置中开启“允许 AI 分析本地内容”。', 'CONSENT_REQUIRED')
    }
    const document = await this.dependencies.readDocument(filePath)
    const fingerprint = this.fingerprint(document)
    const cached = this.dependencies.cache.get(filePath, document.sourceHash, fingerprint)
    if (!force && cached.status === 'valid' && cached.record) return { ...cached.record, cacheStatus: 'hit' }

    const settings = this.dependencies.getProviderSecret()
    const result = await this.dependencies.analyzeProvider(settings, document)
    const record = {
      sourceHash: document.sourceHash,
      analysisFingerprint: fingerprint,
      model: settings.model,
      analyzedAt: (this.dependencies.now?.() ?? new Date()).toISOString(),
      result
    }
    this.dependencies.cache.set(filePath, record)
    return { ...record, cacheStatus: force ? 'refresh' : 'miss' }
  }
}
