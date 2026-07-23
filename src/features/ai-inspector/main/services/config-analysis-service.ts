import type { AiAnalysisResponse, AiConfigAnalysis, CachedAnalysisResponse } from '../../shared/contracts/ai-capability'
import type { ConfigDocument } from '../../shared/contracts/config'
import type { AiProviderPublic } from '../../../../platform/ai-provider/shared/contracts'
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
  getProviderPublic(): AiProviderPublic | null | Promise<AiProviderPublic | null>
  isConsentEnabled(): boolean
  analyzeProvider(document: ConfigDocument, providerId: string): Promise<{ result: AiConfigAnalysis; modelId: string }>
  now?: () => Date
}

export class ConfigAnalysisService {
  constructor(private readonly dependencies: ConfigAnalysisDependencies) {}

  private fingerprint(document: ConfigDocument, settings: AiProviderPublic): string {
    return createAnalysisFingerprint({
      sourceHash: document.sourceHash,
      baseUrl: settings.baseUrl,
      model: settings.modelId,
      providerId: settings.id,
      promptVersion: ANALYSIS_PROMPT_VERSION
    })
  }

  async getCached(filePath: string): Promise<CachedAnalysisResponse> {
    const document = await this.dependencies.readDocument(filePath)
    const settings = await this.dependencies.getProviderPublic()
    if (!settings?.modelId) return { status: 'none', record: null }
    return this.dependencies.cache.get(filePath, document.sourceHash, this.fingerprint(document, settings))
  }

  async analyze(filePath: string, force = false): Promise<AiAnalysisResponse> {
    if (!this.dependencies.isConsentEnabled()) {
      throw new ConfigAnalysisError('请先在设置中开启“允许 AI 分析本地内容”。', 'CONSENT_REQUIRED')
    }
    const document = await this.dependencies.readDocument(filePath)
    const provider = await this.dependencies.getProviderPublic()
    if (!provider) throw new ConfigAnalysisError('请先新增并选择一个可用的 AI Provider。', 'INVALID_SETTINGS')
    const fingerprint = this.fingerprint(document, provider)
    const cached = this.dependencies.cache.get(filePath, document.sourceHash, fingerprint)
    if (!force && cached.status === 'valid' && cached.record) return { ...cached.record, cacheStatus: 'hit' }

    const analyzed = await this.dependencies.analyzeProvider(document, provider.id)
    const record = {
      sourceHash: document.sourceHash,
      analysisFingerprint: fingerprint,
      model: analyzed.modelId,
      analyzedAt: (this.dependencies.now?.() ?? new Date()).toISOString(),
      result: analyzed.result
    }
    this.dependencies.cache.set(filePath, record)
    return { ...record, cacheStatus: force ? 'refresh' : 'miss' }
  }
}
