import { describe, expect, it, vi } from 'vitest'
import type { AiConfigAnalysis } from '../src/shared/contracts/ai-capability'
import type { ConfigDocument } from '../src/shared/contracts/config'
import { AnalysisCache, type AnalysisCacheStorage } from '../src/main/services/analysis-cache'
import { ConfigAnalysisService } from '../src/main/services/config-analysis-service'

class MemoryCacheStorage implements AnalysisCacheStorage {
  value: unknown = {}
  read(): unknown { return this.value }
  write(value: unknown): void { this.value = value }
}

const result: AiConfigAnalysis = {
  summary: '配置摘要',
  detectedTool: null,
  sections: [],
  risks: [],
  recommendations: []
}

function makeDocument(sourceHash = 'a'.repeat(64)): ConfigDocument {
  return {
    path: '/authorized/config.json', name: 'config.json', format: 'json', sizeBytes: 2,
    modifiedAt: '2026-07-21T00:00:00.000Z', sourceHash, redactedText: '{}', data: {},
    parseError: null, redactionCount: 0
  }
}

function makeHarness(overrides: { consent?: boolean; sourceHash?: string; model?: string } = {}) {
  let document = makeDocument(overrides.sourceHash)
  let model = overrides.model ?? 'demo-model'
  const provider = vi.fn(async () => result)
  const cache = new AnalysisCache(new MemoryCacheStorage())
  const service = new ConfigAnalysisService({
    cache,
    readDocument: async () => document,
    getProviderPublic: () => ({ provider: 'openai-compatible', baseUrl: 'https://example.com/v1', model, apiKeyConfigured: true }),
    getProviderSecret: () => ({ baseUrl: 'https://example.com/v1', model, apiKey: 'secret' }),
    isConsentEnabled: () => overrides.consent ?? true,
    analyzeProvider: provider,
    now: () => new Date('2026-07-21T01:00:00.000Z')
  })
  return {
    service, cache, provider,
    updateDocument: (sourceHash: string) => { document = makeDocument(sourceHash) },
    updateModel: (next: string) => { model = next }
  }
}

describe('ConfigAnalysisService cache behavior', () => {
  it('calls the provider once and reuses the result while all inputs are unchanged', async () => {
    const { service, provider } = makeHarness()
    expect((await service.analyze('/authorized/config.json')).cacheStatus).toBe('miss')
    expect((await service.analyze('/authorized/config.json')).cacheStatus).toBe('hit')
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('invalidates the cache after any source content change', async () => {
    const harness = makeHarness()
    await harness.service.analyze('/authorized/config.json')
    harness.updateDocument('b'.repeat(64))
    expect((await harness.service.getCached('/authorized/config.json')).status).toBe('stale')
    expect((await harness.service.analyze('/authorized/config.json')).cacheStatus).toBe('miss')
    expect(harness.provider).toHaveBeenCalledTimes(2)
  })

  it('invalidates when the configured model changes', async () => {
    const harness = makeHarness()
    await harness.service.analyze('/authorized/config.json')
    harness.updateModel('another-model')
    expect((await harness.service.analyze('/authorized/config.json')).cacheStatus).toBe('miss')
    expect(harness.provider).toHaveBeenCalledTimes(2)
  })

  it('supports forced refresh for unchanged content', async () => {
    const harness = makeHarness()
    await harness.service.analyze('/authorized/config.json')
    expect((await harness.service.analyze('/authorized/config.json', true)).cacheStatus).toBe('refresh')
    expect(harness.provider).toHaveBeenCalledTimes(2)
  })

  it('blocks network analysis when consent is disabled', async () => {
    const harness = makeHarness({ consent: false })
    await expect(harness.service.analyze('/authorized/config.json')).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' })
    expect(harness.provider).not.toHaveBeenCalled()
  })

  it('clears all cached records without storing configuration content', async () => {
    const harness = makeHarness()
    await harness.service.analyze('/authorized/config.json')
    expect(JSON.stringify((harness.cache as unknown as { storage: MemoryCacheStorage }).storage.value)).not.toContain('redactedText')
    expect(harness.cache.clear()).toBe(1)
    expect((await harness.service.getCached('/authorized/config.json')).status).toBe('none')
  })
})
