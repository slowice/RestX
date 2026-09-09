import { describe, expect, it, vi } from 'vitest'
import { parseReviewRulePack, selectReviewRulePacks } from '../src/features/code-review/main/services/review-rule-packs'
import { buildReviewBatches, reviewCodeBatch } from '../src/features/code-review/main/services/code-review-provider'
import { parseChangedNewLines } from '../src/features/code-review/main/services/code-review-source'

describe('built-in review policy delivery', () => {
  it('preserves mandatory metadata with Windows line endings', () => {
    const markdown = ['---', 'id: windows-rules', 'name: Windows', 'version: 1.0.0', 'zones: [blue]', "languages: ['*']", 'categories: [bug]', 'mandatory: true', '---', '# Rules', 'Check errors.'].join('\r\n')
    expect(parseReviewRulePack(markdown)).toMatchObject({ mandatory: true, instructions: '# Rules\nCheck errors.' })
  })
  it.each(['blue', 'yellow'] as const)('always includes general and custom policy in %s, even for unknown languages', (zone) => {
    const packs = selectReviewRulePacks(zone, ['main.py', 'config.yaml'])
    expect(packs.map((pack) => pack.id)).toEqual(expect.arrayContaining([
      'review-baseline', 'security-baseline', 'logging-quality', 'custom-rule-completion'
    ]))
    expect(packs.find((pack) => pack.id === 'custom-rule-completion')).toMatchObject({ name: '自定义规则补全', mandatory: true })
    expect(packs.some((pack) => pack.id === 'java-mybatis-sql')).toBe(false)
    expect(packs.some((pack) => pack.id === 'typescript-quality')).toBe(false)
  })

  it('selects language supplements only for matching changes', () => {
    expect(selectReviewRulePacks('blue', ['Demo.JAVA']).map((pack) => pack.id)).toContain('java-mybatis-sql')
    const tsPacks = selectReviewRulePacks('blue', ['Page.tsx']).map((pack) => pack.id)
    expect(tsPacks).toContain('typescript-quality')
    expect(tsPacks).not.toContain('java-mybatis-sql')
  })

  it('sends custom requirements with every batch and identifies limited context', async () => {
    const patch = '@@ -1 +1 @@\n-old\n+console.error(error.stack)'
    const files = ['one.ts', 'two.ts'].map((path) => ({
      path, status: 'modified' as const, additions: 1, deletions: 1, eligible: true,
      patchCharacters: 40000, patch: patch + '\n ' + 'x'.repeat(40000), changedNewLines: parseChangedNewLines(patch)
    }))
    const rulePacks = selectReviewRulePacks('blue', files.map((file) => file.path))
    const batches = buildReviewBatches(files, rulePacks)
    expect(batches).toHaveLength(2)
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"summary":"完成","findings":[]}' } }] }), { status: 200 }))
    for (const batch of batches) {
      await reviewCodeBatch({ settings: { baseUrl: 'https://example.com/v1', apiKey: 'test', model: 'test' }, batch, rulePacks,
        sourceSummary: { title: 'Demo', repository: 'demo/repo', baseBranch: 'main', headBranch: 'feature' }, fetchImpl })
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    for (const [, init] of fetchImpl.mock.calls) {
      const body = JSON.parse(String(init?.body))
      const payload = JSON.parse(body.messages[1].content)
      expect(payload.contextMode).toBe('remote-limited')
      const custom = payload.rules.find((rule: { id: string }) => rule.id === 'custom-rule-completion')
      expect(custom).toBeDefined()
      expect(custom.instructions).toContain('CUSTOM-001')
      expect(custom.instructions).toContain('CUSTOM-002')
      expect(custom.instructions).toContain('CUSTOM-003')
      expect(payload.rules.find((rule: { id: string }) => rule.id === 'logging-quality').version).not.toBe('1.0.0')
    }
  })
})
