import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedAiProvider } from '../src/platform/ai-provider/shared/contracts'
import type { CodeReviewResult } from '../src/features/code-review/shared/contracts/code-review'
import { CodeReviewCache, type ReviewCacheCrypto, type ReviewCacheStorage } from '../src/features/code-review/main/services/code-review-cache'
import { parseCodeReviewResponse } from '../src/features/code-review/main/services/code-review-provider'
import { parseChangedNewLines } from '../src/features/code-review/main/services/code-review-source'
import { CodeReviewService } from '../src/features/code-review/main/services/code-review-service'
import { GitCodeAdapter } from '../src/features/code-review/main/services/gitcode-adapter'
import { parseReviewRulePack } from '../src/features/code-review/main/services/review-rule-packs'

class MemoryStorage implements ReviewCacheStorage {
  values = new Map<string, unknown>()
  get(key: string): unknown { return this.values.get(key) }
  set(key: string, value: unknown): void { this.values.set(key, value) }
}

const crypto: ReviewCacheCrypto = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(value).toString('base64'),
  decrypt: (value) => Buffer.from(value, 'base64').toString()
}

const result: Omit<CodeReviewResult, 'expiresAt'> = {
  reviewId: 'review-1', sourceId: 'source', summary: '完成', findings: [], reviewedFiles: 1, excludedFiles: 0,
  model: 'demo', rules: [{ id: 'security', name: '安全', version: '1.0.0' }], analyzedAt: '2026-07-22T00:00:00.000Z', cacheStatus: 'miss'
}

afterEach(() => vi.unstubAllGlobals())

describe('review rule packs', () => {
  it('parses Skill-style Markdown with validated frontmatter', () => {
    expect(parseReviewRulePack(`---\nid: demo-rules\nname: 演示规则\nversion: 1.0.0\nzones: [blue]\nlanguages: [java]\ncategories: [security]\nmandatory: true\n---\n# 规则\n检查安全问题。`)).toMatchObject({ id: 'demo-rules', zones: ['blue'], languages: ['java'], mandatory: true })
  })

  it('rejects a rule pack that tries to use an unknown zone', () => {
    expect(() => parseReviewRulePack(`---\nid: demo\nname: Demo\nversion: 1.0.0\nzones: [red]\nlanguages: ['*']\ncategories: [security]\n---\n# Demo`)).toThrow(/区域/)
  })
})

describe('diff and finding validation', () => {
  const patch = '@@ -10,2 +10,3 @@\n old\n+new insecure line\n end'
  const file = { path: 'src/Demo.java', status: 'modified' as const, additions: 1, deletions: 0, eligible: true, patchCharacters: patch.length, patch, changedNewLines: parseChangedNewLines(patch) }

  it('tracks only added diff lines and keeps valid model findings', () => {
    expect([...file.changedNewLines]).toEqual([11])
    const parsed = parseCodeReviewResponse(JSON.stringify({ summary: '发现风险', findings: [{ severity: 'P1', category: 'security', title: '敏感字段', explanation: '新增字段可能泄露。', evidence: 'new insecure line', filePath: 'src/Demo.java', startLine: 11, ruleId: 'SEC-1', confidence: 'high', suggestion: '移除字段' }] }), [file])
    expect(parsed.findings).toHaveLength(1)
    expect(parsed.findings[0]).toMatchObject({ filePath: 'src/Demo.java', startLine: 11, severity: 'P1' })
  })

  it('drops hallucinated paths and unchanged lines', () => {
    const parsed = parseCodeReviewResponse(JSON.stringify({ summary: '完成', findings: [
      { severity: 'P1', category: 'bug', title: '错误行', explanation: '不在变更行', evidence: 'old', filePath: 'src/Demo.java', startLine: 10, ruleId: 'BUG-1', confidence: 'high' },
      { severity: 'P1', category: 'bug', title: '未知文件', explanation: '不存在', evidence: 'x', filePath: 'src/Other.java', startLine: 1, ruleId: 'BUG-2', confidence: 'high' }
    ] }), [file])
    expect(parsed.findings).toEqual([])
  })
})

describe('review cache and zone enforcement', () => {
  it('encrypts structured results, hits within TTL, and expires after seven days', () => {
    let now = new Date('2026-07-22T00:00:00.000Z')
    const storage = new MemoryStorage()
    const cache = new CodeReviewCache(storage, crypto, () => now)
    const saved = cache.set('fingerprint', result)
    expect(JSON.stringify(storage.values)).not.toContain('完成')
    expect(cache.get('fingerprint')).toMatchObject({ reviewId: 'review-1' })
    now = new Date(saved.expiresAt)
    expect(cache.get('fingerprint')).toBeNull()
  })

  it('keeps results in memory when secure storage is unavailable', () => {
    const storage = new MemoryStorage()
    const cache = new CodeReviewCache(storage, { ...crypto, isAvailable: () => false })
    cache.set('fingerprint', result)
    expect(cache.get('fingerprint')).toMatchObject({ summary: '完成' })
    expect(storage.get('records')).toBeUndefined()
  })

  it('rejects a GitCode source submitted as yellow before network access', async () => {
    const fetchImpl = vi.fn()
    const adapter = new GitCodeAdapter({ getAccessToken: () => 'token', fetchImpl })
    const cache = new CodeReviewCache(new MemoryStorage(), { ...crypto, isAvailable: () => false })
    const service = new CodeReviewService(cache, adapter)
    await expect(service.preview({ url: 'https://gitcode.com/OpenMatrix/MatrixAssistant/pull/1958', zone: 'yellow' })).rejects.toMatchObject({ code: 'ZONE_MISMATCH' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('uses the shared active Provider and keeps review cache valid when only its credential rotates', async () => {
    const sourceFetch = vi.fn(async (input: string | URL | Request) => String(input).endsWith('/files')
      ? new Response(JSON.stringify([{ filename: 'src/Demo.ts', status: 'modified', additions: 1, deletions: 0, patch: { diff: '@@ -1,1 +1,2 @@\n old\n+new', new_path: 'src/Demo.ts' } }]), { status: 200 })
      : new Response(JSON.stringify({ title: 'Demo', state: 'open', base: { ref: 'main' }, head: { ref: 'feature', sha: 'head' } }), { status: 200 }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: '完成', findings: [] }) } }] }), { status: 200 })))
    const adapter = new GitCodeAdapter({ getAccessToken: () => 'gitcode-token', fetchImpl: sourceFetch })
    const cache = new CodeReviewCache(new MemoryStorage(), { ...crypto, isAvailable: () => false })
    let providerCalls = 0
    let apiKey = 'provider-key-one'
    const providers = {
      getActivePublic: async () => ({ id: 'shared', name: 'Shared', source: 'manual' as const, baseUrl: 'https://ai.example/v1', modelId: 'common-model', apiKeyConfigured: true, status: 'ready' as const, active: true, editable: true, identityFingerprint: 'stable-model-identity' }),
      execute: async <T>(id: string, operation: (provider: ResolvedAiProvider) => Promise<T>): Promise<T> => {
        expect(id).toBe('shared')
        providerCalls += 1
        return operation({ id: 'shared', name: 'Shared', source: 'manual', baseUrl: 'https://ai.example/v1', modelId: 'common-model', apiKey, identityFingerprint: 'stable-model-identity', credentialFingerprint: apiKey })
      }
    }
    const service = new CodeReviewService(cache, adapter, async () => null, providers)
    const input = { url: 'https://gitcode.com/team/repo/pull/1', zone: 'blue' as const }
    expect((await service.run(input)).cacheStatus).toBe('miss')
    apiKey = 'provider-key-two'
    expect((await service.run(input)).cacheStatus).toBe('hit')
    expect(providerCalls).toBe(1)
  })

  it('marks the current head as passed or problematic and older heads as stale', () => {
    const cache = new CodeReviewCache(new MemoryStorage(), crypto)
    cache.set('passed', { ...result, sourceId: 'gitcode:team/repo#7@sha-1', analyzedAt: '2026-07-22T01:00:00.000Z' })
    expect(cache.getReviewState('gitcode:team/repo#7@sha-1')).toMatchObject({ status: 'passed', findingCount: 0 })
    expect(cache.getReviewState('gitcode:team/repo#7@sha-2')).toMatchObject({ status: 'stale' })

    cache.set('issues', {
      ...result,
      sourceId: 'gitcode:team/repo#7@sha-2',
      analyzedAt: '2026-07-22T02:00:00.000Z',
      findings: [{ id: 'finding', severity: 'P1', category: 'bug', title: '空值风险', explanation: '可能为空。', evidence: 'value.call()', filePath: 'src/demo.ts', startLine: 1, ruleId: 'BUG-1', confidence: 'high' }]
    })
    expect(cache.getReviewState('gitcode:team/repo#7@sha-2')).toMatchObject({ status: 'issues', findingCount: 1 })
  })
})
