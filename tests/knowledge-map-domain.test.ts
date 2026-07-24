import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { buildKnowledgeGraph } from '../src/features/knowledge-map/main/services/knowledge-catalog'
import { parseKnowledgeMarkdown } from '../src/features/knowledge-map/main/services/markdown-parser'
import { scanKnowledgeRoot } from '../src/features/knowledge-map/main/services/knowledge-scanner'

const temporaryRoots: string[] = []

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'restx-knowledge-domain-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('knowledge Markdown domain', () => {
  test('keeps Markdown without metadata as pending and extracts its heading', () => {
    const parsed = parseKnowledgeMarkdown('# File access failed\n\nDetails', 'problems/file.md')

    expect(parsed.summary).toMatchObject({
      id: 'problems/file.md',
      title: 'File access failed',
      status: 'pending'
    })
    expect(parsed.body).toBe('# File access failed\n\nDetails')
    expect(parsed.frontmatter).toBeNull()
  })

  test('parses an organized problem and preserves unknown Frontmatter', () => {
    const parsed = parseKnowledgeMarkdown(`---
owner: xubin
type: problem
scene: Knowledge Manager
capability:
  - Electron
knowledge:
  - IPC
---
# Why cannot the file open?
`, 'problem.md')

    expect(parsed.summary).toMatchObject({
      status: 'organized',
      labels: {
        scene: 'Knowledge Manager',
        capabilities: ['Electron'],
        knowledge: ['IPC']
      }
    })
    expect(parsed.frontmatter?.get('owner')).toBe('xubin')
    expect(parsed.body).toContain('# Why cannot the file open?')
  })

  test('marks malformed YAML invalid without discarding Markdown content', () => {
    const parsed = parseKnowledgeMarkdown(`---
scene: [broken
---
# Broken metadata
`, 'broken.md')

    expect(parsed.summary.status).toBe('invalid')
    expect(parsed.summary.issue).toContain('Frontmatter')
    expect(parsed.body).toContain('# Broken metadata')
  })

  test('aggregates canonical labels into one layered graph node', () => {
    const first = parseKnowledgeMarkdown(`---
type: problem
scene: Knowledge Manager
capability: [Electron]
knowledge: [IPC]
---
# One
`, 'one.md').summary
    const second = parseKnowledgeMarkdown(`---
type: problem
scene: " knowledge manager "
capability: [electron]
knowledge: [IPC]
---
# Two
`, 'two.md').summary

    const graph = buildKnowledgeGraph([first, second])

    expect(graph.scenes).toHaveLength(1)
    expect(graph.scenes[0]).toMatchObject({ label: 'Knowledge Manager', problemCount: 2 })
    expect(graph.capabilities).toHaveLength(1)
    expect(graph.knowledge).toHaveLength(1)
    expect(graph.problems).toHaveLength(2)
    expect(graph.edges.filter((edge) => edge.kind === 'scene-capability')).toHaveLength(1)
  })

  test('recursively scans regular Markdown while excluding hidden, backup, and symlink trees', async () => {
    const root = await createTemporaryRoot()
    const outside = await createTemporaryRoot()
    await mkdir(path.join(root, 'archive'), { recursive: true })
    await mkdir(path.join(root, '.hidden'), { recursive: true })
    await mkdir(path.join(root, '.restx-backup'), { recursive: true })
    await writeFile(path.join(root, 'pending.md'), '# Pending')
    await writeFile(path.join(root, 'archive', 'organized.markdown'), '# Archived')
    await writeFile(path.join(root, '.hidden', 'secret.md'), '# Hidden')
    await writeFile(path.join(root, '.restx-backup', 'old.md'), '# Backup')
    await writeFile(path.join(outside, 'outside.md'), '# Outside')
    await symlink(outside, path.join(root, 'linked'))

    const snapshot = await scanKnowledgeRoot(root)

    expect(snapshot.problems.map((problem) => problem.summary.id)).toEqual([
      'archive/organized.markdown',
      'pending.md'
    ])
    expect(snapshot.skipped.some((entry) => entry.reason === 'symbolic-link')).toBe(true)
  })

  test('skips oversized Markdown instead of reading it', async () => {
    const root = await createTemporaryRoot()
    await writeFile(path.join(root, 'large.md'), 'x'.repeat(128))

    const snapshot = await scanKnowledgeRoot(root, { maxFileBytes: 64 })

    expect(snapshot.problems).toHaveLength(0)
    expect(snapshot.skipped).toContainEqual({ id: 'large.md', reason: 'file-too-large' })
  })
})
