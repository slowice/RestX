import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ResolvedAiProvider } from '../src/platform/ai-provider/shared/contracts'
import {
  classifyKnowledgeProblem,
  KnowledgeClassificationError,
  normalizeClassificationSuggestion
} from '../src/features/knowledge-map/main/services/knowledge-classifier'
import { parseKnowledgeMarkdown } from '../src/features/knowledge-map/main/services/markdown-parser'
import {
  applyKnowledgeClassification,
  KnowledgeWriteError
} from '../src/features/knowledge-map/main/services/markdown-writer'

const temporaryRoots: string[] = []

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'restx-knowledge-classification-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const provider: ResolvedAiProvider = {
  id: 'provider-1',
  name: 'Test Provider',
  source: 'manual',
  baseUrl: 'https://example.test/v1',
  modelId: 'test-model',
  apiKey: 'secret',
  identityFingerprint: 'identity',
  credentialFingerprint: 'credential'
}

describe('knowledge problem classification', () => {
  test('reuses canonical labels and marks genuinely new labels', () => {
    const result = normalizeClassificationSuggestion(
      { scene: ' knowledge manager ', capability: ['electron'], knowledge: ['IPC', 'Frontmatter'] },
      { scenes: ['Knowledge Manager'], capabilities: ['Electron'], knowledge: ['IPC'] }
    )

    expect(result.scene).toEqual({ value: 'Knowledge Manager', existing: true })
    expect(result.capabilities).toEqual([{ value: 'Electron', existing: true }])
    expect(result.knowledge).toEqual([
      { value: 'IPC', existing: true },
      { value: 'Frontmatter', existing: false }
    ])
  })

  test('calls the active OpenAI-compatible provider and returns a bounded suggestion', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"scene":"Knowledge Manager","capability":["Electron"],"knowledge":["IPC"]}' } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const suggestion = await classifyKnowledgeProblem({
      problemId: 'problem.md',
      sourceFingerprint: 'fingerprint',
      markdown: '# Cannot open file',
      catalog: { scenes: ['Knowledge Manager'], capabilities: ['Electron'], knowledge: ['IPC'] },
      provider,
      fetchImpl
    })

    expect(suggestion).toMatchObject({
      problemId: 'problem.md',
      sourceFingerprint: 'fingerprint',
      scene: { value: 'Knowledge Manager', existing: true }
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const request = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as { messages: Array<{ content: string }> }
    expect(request.messages[1]?.content).toContain('Cannot open file')
    expect(request.messages[1]?.content).not.toContain('secret')
  })

  test('rejects malformed or empty model labels', () => {
    expect(() => normalizeClassificationSuggestion(
      { scene: '', capability: [], knowledge: ['IPC'] },
      { scenes: [], capabilities: [], knowledge: [] }
    )).toThrowError(KnowledgeClassificationError)
  })

  test('backs up the original and preserves body and unknown metadata', async () => {
    const root = await createTemporaryRoot()
    const original = `---
owner: xubin
---
# Existing body

Keep this exact content.
`
    const filePath = path.join(root, 'problem.md')
    await writeFile(filePath, original)
    const parsed = parseKnowledgeMarkdown(original, 'problem.md')

    const result = await applyKnowledgeClassification({
      root,
      input: {
        problemId: 'problem.md',
        sourceFingerprint: parsed.summary.sourceFingerprint,
        scene: 'Knowledge Manager',
        capabilities: ['Electron'],
        knowledge: ['IPC']
      },
      now: () => new Date('2026-07-24T10:00:00.000Z')
    })

    const updated = await readFile(filePath, 'utf8')
    const backupNames = await readdir(path.join(root, '.restx-backup'))
    const backup = await readFile(path.join(root, '.restx-backup', backupNames[0]!), 'utf8')
    expect(result.summary.status).toBe('organized')
    expect(backup).toBe(original)
    expect(updated).toContain('owner: xubin')
    expect(updated).toContain('scene: Knowledge Manager')
    expect(updated).toContain('# Existing body\n\nKeep this exact content.')
  })

  test('rejects writeback when the source fingerprint changed', async () => {
    const root = await createTemporaryRoot()
    await writeFile(path.join(root, 'problem.md'), '# Changed')

    await expect(applyKnowledgeClassification({
      root,
      input: {
        problemId: 'problem.md',
        sourceFingerprint: 'stale',
        scene: 'Knowledge Manager',
        capabilities: ['Electron'],
        knowledge: ['IPC']
      }
    })).rejects.toMatchObject<Partial<KnowledgeWriteError>>({ code: 'SOURCE_CONFLICT' })
  })

  test('rejects problem IDs that escape the knowledge root', async () => {
    const root = await createTemporaryRoot()

    await expect(applyKnowledgeClassification({
      root,
      input: {
        problemId: '../outside.md',
        sourceFingerprint: 'fingerprint',
        scene: 'Knowledge Manager',
        capabilities: ['Electron'],
        knowledge: ['IPC']
      }
    })).rejects.toMatchObject<Partial<KnowledgeWriteError>>({ code: 'INVALID_PROBLEM_ID' })
  })

  test('rejects writeback through a symbolic link outside the knowledge root', async () => {
    const root = await createTemporaryRoot()
    const outside = await createTemporaryRoot()
    const outsidePath = path.join(outside, 'secret.md')
    const original = '# Must stay outside'
    await writeFile(outsidePath, original)
    await symlink(outsidePath, path.join(root, 'problem.md'))
    const parsed = parseKnowledgeMarkdown(original, 'problem.md')

    await expect(applyKnowledgeClassification({
      root,
      input: {
        problemId: 'problem.md',
        sourceFingerprint: parsed.summary.sourceFingerprint,
        scene: 'Knowledge Manager',
        capabilities: ['Electron'],
        knowledge: ['IPC']
      }
    })).rejects.toMatchObject<Partial<KnowledgeWriteError>>({ code: 'SOURCE_UNAVAILABLE' })
    await expect(readFile(outsidePath, 'utf8')).resolves.toBe(original)
  })
})
