import { describe, expect, it, vi } from 'vitest'
import { CodeHubAdapter } from '../src/features/code-review/main/services/codehub-adapter'
import { GitCodeAdapter } from '../src/features/code-review/main/services/gitcode-adapter'
import { readGlobalGitEmail } from '../src/features/code-review/main/services/local-git-identity'

describe('GitCodeAdapter', () => {
  it('parses the singular pull URL used by GitCode pages and plural API-style URLs', () => {
    const adapter = new GitCodeAdapter({ getAccessToken: () => 'token', fetchImpl: vi.fn() })
    expect(adapter.parseUrl(new URL('https://gitcode.com/OpenMatrix/MatrixAssistant/pull/1958'))).toMatchObject({ owner: 'OpenMatrix', repository: 'MatrixAssistant', number: 1958, zone: 'blue' })
    expect(adapter.parseUrl(new URL('https://gitcode.com/OpenMatrix/MatrixAssistant/pulls/1958/files'))).toMatchObject({ number: 1958 })
  })

  it('loads metadata and text patches using an authorization header without token query strings', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/files')) return new Response(JSON.stringify([{
        filename: 'src/Demo.java', status: 'modified', additions: '1', deletions: '0',
        patch: { diff: '@@ -1,2 +1,3 @@\n class Demo {\n+  String token;\n }', new_path: 'src/Demo.java', old_path: 'src/Demo.java' }
      }]), { status: 200 })
      return new Response(JSON.stringify({ title: '安全修复', state: 'merged', user: { name: 'xubin' }, base: { ref: 'main', sha: 'base' }, head: { ref: 'feature', sha: 'head-sha' } }), { status: 200 })
    })
    const adapter = new GitCodeAdapter({ getAccessToken: () => 'top-secret', fetchImpl })
    const locator = adapter.parseUrl(new URL('https://gitcode.com/OpenMatrix/MatrixAssistant/pull/1958'))
    const result = await adapter.load(locator)

    expect(result.preview).toMatchObject({ state: 'merged', title: '安全修复', headSha: 'head-sha', eligibleFiles: 1, inputCharacters: expect.any(Number) })
    expect(result.files[0].changedNewLines.has(2)).toBe(true)
    for (const [url, init] of fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(url).not.toContain('top-secret')
      expect(init.headers).toMatchObject({ Authorization: 'Bearer top-secret' })
    }
  })

  it('maps authentication failures to a safe message', async () => {
    const adapter = new GitCodeAdapter({ getAccessToken: () => 'bad-token', fetchImpl: vi.fn(async () => new Response('secret rejected', { status: 403 })) })
    const locator = adapter.parseUrl(new URL('https://gitcode.com/a/b/pull/1'))
    await expect(adapter.load(locator)).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' })
    await expect(adapter.load(locator)).rejects.not.toThrow(/secret rejected/)
  })

  it('lists the authenticated user open PRs and verifies the local Git email', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      expect(url).not.toContain('top-secret')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer top-secret' })
      if (url.endsWith('/user')) return new Response(JSON.stringify({ login: 'xubin', name: '徐斌', email: 'xubin@example.com' }), { status: 200 })
      if (url.endsWith('/emails')) return new Response(JSON.stringify([{ email: 'xubin@example.com', state: 'confirmed' }]), { status: 200 })
      if (url.includes('/user/pulls?')) return new Response(JSON.stringify([{
        html_url: 'https://gitcode.com/OpenMatrix/MatrixAssistant/pull/2001',
        title: '优化代码自检', state: 'open', updated_at: '2026-07-22T12:00:00Z',
        user: { login: 'xubin' }, base: { ref: 'main' }, head: { ref: 'feature/review-list', sha: 'head-2001' }
      }]), { status: 200 })
      return new Response(null, { status: 404 })
    })
    const adapter = new GitCodeAdapter({ getAccessToken: () => 'top-secret', fetchImpl })
    const list = await adapter.listMine('XUBIN@example.com')

    expect(list.identity).toMatchObject({ accountLogin: 'xubin', accountName: '徐斌', match: 'matched' })
    expect(list.mergeRequests).toEqual([expect.objectContaining({
      sourceId: 'gitcode:OpenMatrix/MatrixAssistant#2001@head-2001',
      title: '优化代码自检', headBranch: 'feature/review-list', review: { status: 'unreviewed' }
    })])
    expect(fetchImpl.mock.calls.some(([input]) => String(input).includes('scope=created_by_me&state=open&sort=updated&direction=desc'))).toBe(true)
  })
})

describe('local Git identity', () => {
  it('normalizes a configured global email and safely handles missing configuration', async () => {
    await expect(readGlobalGitEmail(async () => ' xubin@example.com\n')).resolves.toBe('xubin@example.com')
    await expect(readGlobalGitEmail(async () => { throw new Error('missing') })).resolves.toBeNull()
    await expect(readGlobalGitEmail(async () => 'not-an-email')).resolves.toBeNull()
  })
})

describe('CodeHubAdapter', () => {
  it('keeps platform-specific work behind an explicit not-configured boundary', () => {
    const adapter = new CodeHubAdapter(['codehub.internal'])
    const url = new URL('https://codehub.internal/team/repo/merge_requests/1')
    expect(adapter.matches(url)).toBe(true)
    expect(() => adapter.parseUrl(url)).toThrow(/黄区/)
  })
})
