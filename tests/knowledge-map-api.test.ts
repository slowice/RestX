import { mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { RestXApi } from '../src/app-api'
import { KnowledgeService, KnowledgeServiceError } from '../src/features/knowledge-map/main/knowledge-service'
import { knowledgeMapPreloadFeature } from '../src/features/knowledge-map/preload/api'
import { knowledgeMapChannels } from '../src/features/knowledge-map/shared/channels'
import type { PreloadInvoke } from '../src/platform/preload/define-feature'

const temporaryRoots: string[] = []

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'restx-knowledge-api-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('knowledge map API boundary', () => {
  test('preload exposes fixed knowledge methods and channels', async () => {
    const calls = vi.fn()
    const invoke: PreloadInvoke = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
      calls(channel, ...args)
      return undefined as T
    }
    const api = knowledgeMapPreloadFeature.createApi(invoke) as RestXApi
    const input = {
      problemId: 'problem.md',
      sourceFingerprint: 'fingerprint',
      scene: 'Scene',
      capabilities: ['Capability'],
      knowledge: ['Knowledge']
    }

    await api.knowledge.scan()
    await api.knowledge.read('problem.md')
    await api.knowledge.classify('problem.md')
    await api.knowledge.apply(input)
    await api.knowledge.open('problem.md')
    await api.knowledge.openRoot()

    expect(calls.mock.calls).toEqual([
      [knowledgeMapChannels.scan],
      [knowledgeMapChannels.read, 'problem.md'],
      [knowledgeMapChannels.classify, 'problem.md'],
      [knowledgeMapChannels.apply, input],
      [knowledgeMapChannels.open, 'problem.md'],
      [knowledgeMapChannels.openRoot]
    ])
    expect(Object.keys(api.knowledge).sort()).toEqual(['apply', 'classify', 'open', 'openRoot', 'read', 'scan'])
  })

  test('scan and read return relative identifiers without absolute paths', async () => {
    const root = await createTemporaryRoot()
    await writeFile(path.join(root, 'problem.md'), '# Local problem')
    const service = new KnowledgeService({
      root,
      openPath: vi.fn(async () => ''),
      executeActive: vi.fn()
    })

    const scan = await service.scan()
    const detail = await service.read('problem.md')

    expect(scan.problems[0]).toMatchObject({ id: 'problem.md', status: 'pending' })
    expect(JSON.stringify(scan)).not.toContain(root)
    expect(detail.markdown).toBe('# Local problem')
    expect(JSON.stringify(detail)).not.toContain(root)
  })

  test('rejects a problem that is not in the latest scan snapshot', async () => {
    const root = await createTemporaryRoot()
    const service = new KnowledgeService({
      root,
      openPath: vi.fn(async () => ''),
      executeActive: vi.fn()
    })
    await service.scan()

    await expect(service.read('../outside.md')).rejects.toMatchObject<Partial<KnowledgeServiceError>>({
      code: 'STALE_PROBLEM'
    })
  })

  test('opens only a current scanned problem', async () => {
    const root = await createTemporaryRoot()
    await writeFile(path.join(root, 'problem.md'), '# Local problem')
    const openPath = vi.fn(async () => '')
    const service = new KnowledgeService({ root, openPath, executeActive: vi.fn() })
    await service.scan()

    await service.open('problem.md')

    expect(openPath).toHaveBeenCalledWith(path.join(root, 'problem.md'))
  })

  test('rejects a file replaced by an external symbolic link after scanning', async () => {
    const root = await createTemporaryRoot()
    const outside = await createTemporaryRoot()
    const problemPath = path.join(root, 'problem.md')
    await writeFile(problemPath, '# Original')
    await writeFile(path.join(outside, 'secret.md'), '# Secret outside root')
    const service = new KnowledgeService({
      root,
      openPath: vi.fn(async () => ''),
      executeActive: vi.fn()
    })
    await service.scan()
    await unlink(problemPath)
    await symlink(path.join(outside, 'secret.md'), problemPath)

    await expect(service.read('problem.md')).rejects.toMatchObject<Partial<KnowledgeServiceError>>({
      code: 'SOURCE_UNAVAILABLE'
    })
  })

  test('rejects a file that grows beyond the preview limit after scanning', async () => {
    const root = await createTemporaryRoot()
    const problemPath = path.join(root, 'problem.md')
    await writeFile(problemPath, '# Original')
    const service = new KnowledgeService({
      root,
      openPath: vi.fn(async () => ''),
      executeActive: vi.fn()
    })
    await service.scan()
    await writeFile(problemPath, 'x'.repeat(2_000_001))

    await expect(service.read('problem.md')).rejects.toMatchObject<Partial<KnowledgeServiceError>>({
      code: 'SOURCE_TOO_LARGE'
    })
  })
})
