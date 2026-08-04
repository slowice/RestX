import { mkdtemp, readFile, readdir, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { RestXApi } from '../src/app-api'
import { KnowledgeService } from '../src/features/knowledge-map/main/knowledge-service'
import { applyKnowledgeEdits } from '../src/features/knowledge-map/main/services/markdown-writer'
import { parseKnowledgeMarkdown } from '../src/features/knowledge-map/main/services/markdown-parser'
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
    const editsInput = {
      edits: [{
        problemId: 'problem.md',
        sourceFingerprint: 'a'.repeat(64),
        classification: null
      }]
    }

    await api.knowledge.scan()
    await api.knowledge.read('problem.md')
    await api.knowledge.classify('problem.md')
    await api.knowledge.apply(input)
    await api.knowledge.saveEdits(editsInput)
    await api.knowledge.open('problem.md')
    await api.knowledge.openRoot()

    expect(calls.mock.calls).toEqual([
      [knowledgeMapChannels.scan],
      [knowledgeMapChannels.read, 'problem.md'],
      [knowledgeMapChannels.classify, 'problem.md'],
      [knowledgeMapChannels.apply, input],
      [knowledgeMapChannels.saveEdits, editsInput],
      [knowledgeMapChannels.open, 'problem.md'],
      [knowledgeMapChannels.openRoot]
    ])
    expect(Object.keys(api.knowledge).sort()).toEqual(['apply', 'classify', 'open', 'openRoot', 'read', 'saveEdits', 'scan'])
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

    await expect(service.read('../outside.md')).rejects.toMatchObject({
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

    await expect(service.read('problem.md')).rejects.toMatchObject({
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

    await expect(service.read('problem.md')).rejects.toMatchObject({
      code: 'SOURCE_TOO_LARGE'
    })
  })

  test('saves several edits with backups and preserves unknown metadata and bodies', async () => {
    const root = await createTemporaryRoot()
    const firstPath = path.join(root, 'first.md')
    const secondPath = path.join(root, 'second.md')
    await writeFile(firstPath, `---\nowner: xubin\ntype: problem\nscene: Shared\ncapability: [Electron]\nknowledge: [IPC]\n---\n# First body\n`)
    await writeFile(secondPath, `---\ntype: problem\nscene: Shared\ncapability: [Filesystem]\nknowledge: [YAML]\n---\n# Second body\n`)
    const service = new KnowledgeService({ root, openPath: vi.fn(async () => ''), executeActive: vi.fn() })
    const scan = await service.scan()

    const next = await service.saveEdits({ edits: scan.problems.map((problem) => ({
      problemId: problem.id,
      sourceFingerprint: problem.sourceFingerprint,
      classification: problem.id === 'first.md' ? null : {
        scene: null,
        capabilities: ['Filesystem'],
        knowledge: ['YAML']
      }
    })) })

    const first = await readFile(firstPath, 'utf8')
    const second = await readFile(secondPath, 'utf8')
    expect(first).toContain('owner: xubin')
    expect(first).toContain('# First body')
    expect(first).not.toContain('type: problem')
    expect(second).toContain('capability:')
    expect(second).not.toContain('scene:')
    expect(next.problems.every((problem) => problem.status === 'pending')).toBe(true)
    expect(next.problems.find((problem) => problem.id === 'second.md')?.classification).toEqual({
      scene: null,
      capabilities: ['Filesystem'],
      knowledge: ['YAML']
    })
    expect(await readdir(path.join(root, '.restx-backup'))).toHaveLength(2)
  })

  test('rejects the whole batch when one fingerprint changed before writing', async () => {
    const root = await createTemporaryRoot()
    const firstPath = path.join(root, 'first.md')
    const secondPath = path.join(root, 'second.md')
    await writeFile(firstPath, '# First original')
    await writeFile(secondPath, '# Second original')
    const service = new KnowledgeService({ root, openPath: vi.fn(async () => ''), executeActive: vi.fn() })
    const scan = await service.scan()
    await writeFile(secondPath, '# Second changed externally')

    await expect(service.saveEdits({ edits: scan.problems.map((problem) => ({
      problemId: problem.id,
      sourceFingerprint: problem.sourceFingerprint,
      classification: { scene: 'Scene', capabilities: ['Capability'], knowledge: ['Knowledge'] }
    })) })).rejects.toMatchObject({ code: 'SOURCE_CONFLICT' })

    expect(await readFile(firstPath, 'utf8')).toBe('# First original')
    await expect(readdir(path.join(root, '.restx-backup'))).rejects.toBeTruthy()
  })

  test('restores earlier replacements when a later batch rename fails', async () => {
    const root = await createTemporaryRoot()
    const firstPath = path.join(root, 'first.md')
    const secondPath = path.join(root, 'second.md')
    const firstOriginal = '# First original'
    const secondOriginal = '# Second original'
    await writeFile(firstPath, firstOriginal)
    await writeFile(secondPath, secondOriginal)
    const firstFingerprint = parseKnowledgeMarkdown(firstOriginal, 'first.md').summary.sourceFingerprint
    const secondFingerprint = parseKnowledgeMarkdown(secondOriginal, 'second.md').summary.sourceFingerprint

    await expect(applyKnowledgeEdits({
      root,
      input: { edits: [
        { problemId: 'first.md', sourceFingerprint: firstFingerprint, classification: { scene: 'Scene', capabilities: ['One'], knowledge: ['Knowledge'] } },
        { problemId: 'second.md', sourceFingerprint: secondFingerprint, classification: { scene: 'Scene', capabilities: ['Two'], knowledge: ['Knowledge'] } }
      ] },
      dependencies: {
        renameFile: async (from, to) => {
          if (String(to) === secondPath && String(from).endsWith('.tmp') && !String(from).includes('.rollback.')) {
            throw new Error('simulated rename failure')
          }
          await rename(from, to)
        }
      }
    })).rejects.toMatchObject({ code: 'WRITE_FAILED' })

    expect(await readFile(firstPath, 'utf8')).toBe(firstOriginal)
    expect(await readFile(secondPath, 'utf8')).toBe(secondOriginal)
    expect(await readdir(path.join(root, '.restx-backup'))).toHaveLength(2)
  })
})
