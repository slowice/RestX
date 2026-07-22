import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readJsonlEntry, readJsonlPage } from '../src/features/ai-inspector/main/services/jsonl-browser'

const temporaryDirectories: string[] = []

async function makeJsonl(lines: string[]): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'restx-jsonl-'))
  temporaryDirectories.push(directory)
  const filePath = path.join(directory, 'session.jsonl')
  await writeFile(filePath, `${lines.join('\n')}\n`)
  return filePath
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('JSONL conversation browser', () => {
  it('loads the newest entries first and derives Codex semantic tags', async () => {
    const filePath = await makeJsonl([
      JSON.stringify({ timestamp: '2026-07-21T01:00:00Z', type: 'session_meta' }),
      JSON.stringify({ timestamp: '2026-07-21T01:01:00Z', type: 'response_item', payload: { type: 'reasoning' } }),
      JSON.stringify({ timestamp: '2026-07-21T01:02:00Z', type: 'response_item', payload: { type: 'function_call' } })
    ])

    const page = await readJsonlPage({ path: filePath, profileId: 'codex-events-v1', limit: 2 })

    expect(page.entries).toHaveLength(2)
    expect(page.entries[0].tags).toContainEqual({ label: '思考', tone: 'thinking' })
    expect(page.entries[1].tags).toContainEqual({ label: '工具调用', tone: 'tool' })
    expect(page.entries[1].timestamp).toBe('2026-07-21T01:02:00.000Z')
    expect(page.olderCursor).not.toBeNull()
  })

  it('loads one entry on demand and formats its JSON', async () => {
    const filePath = await makeJsonl([
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'demo' }] } })
    ])
    const page = await readJsonlPage({ path: filePath, profileId: 'claude-code-events-v1' })
    const entry = page.entries[0]
    const detail = await readJsonlEntry({
      path: filePath, profileId: 'claude-code-events-v1', offset: entry.offset,
      byteLength: entry.byteLength, snapshotId: page.file.snapshotId
    })

    expect(detail.formatted).toContain('\n  "message"')
    expect(detail.tags).toContainEqual({ label: '助手', tone: 'assistant' })
    expect(detail.tags).toContainEqual({ label: '思考', tone: 'thinking' })
    expect(detail.parseError).toBeNull()
  })

  it('isolates malformed lines without losing valid neighbors', async () => {
    const filePath = await makeJsonl(['{"type":"user"}', '{bad json', '{"type":"assistant"}'])
    const page = await readJsonlPage({ path: filePath, profileId: 'claude-code-events-v1' })

    expect(page.entries.map((entry) => entry.parseStatus)).toEqual(['valid', 'invalid', 'valid'])
    expect(page.entries[1].tags).toEqual([{ label: '格式异常', tone: 'error' }])
  })

  it('paginates backward without returning duplicate entries', async () => {
    const filePath = await makeJsonl(Array.from({ length: 5 }, (_, index) => JSON.stringify({ type: 'user', index })))
    const newest = await readJsonlPage({ path: filePath, profileId: 'claude-code-events-v1', limit: 2 })
    const older = await readJsonlPage({ path: filePath, profileId: 'claude-code-events-v1', cursor: newest.olderCursor!, snapshotId: newest.file.snapshotId, limit: 2 })

    expect(newest.entries.map((entry) => entry.offset)).toEqual(expect.not.arrayContaining(older.entries.map((entry) => entry.offset)))
    expect(older.entries).toHaveLength(2)
    expect(older.changed).toBe(false)
  })

  it('keeps UTF-8 previews intact and marks a bounded giant line as oversized', async () => {
    const filePath = await makeJsonl([JSON.stringify({ type: 'user', text: '你好'.repeat(800_000) })])
    const page = await readJsonlPage({ path: filePath, profileId: 'claude-code-events-v1' })

    expect(page.entries).toHaveLength(1)
    expect(page.entries[0].parseStatus).toBe('oversized')
    expect(page.entries[0].rawPreview).not.toContain('�')
    expect(page.olderCursor).toBeNull()
  })

  it('rejects symbolic links even when they target a valid JSONL file', async () => {
    const filePath = await makeJsonl(['{"type":"user"}'])
    const linkedPath = path.join(path.dirname(filePath), 'linked.jsonl')
    await symlink(filePath, linkedPath)

    await expect(readJsonlPage({ path: linkedPath, profileId: 'claude-code-events-v1' })).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' })
  })
})
