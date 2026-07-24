import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readJsonlEntry, readJsonlPage, searchJsonlWorkspace } from '../src/features/ai-inspector/main/services/jsonl-browser'

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
  it('derives OpenClaw session roles, tool results, and compaction labels', async () => {
    const filePath = await makeJsonl([
      JSON.stringify({ type: 'session', id: 'session-1', timestamp: '2026-07-23T08:00:00Z', cwd: '/Users/demo/RestX' }),
      JSON.stringify({ type: 'message', timestamp: '2026-07-23T08:01:00Z', message: { role: 'user', content: [{ type: 'text', text: '检查 Gateway 状态' }] } }),
      JSON.stringify({ type: 'message', timestamp: '2026-07-23T08:02:00Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Gateway 正常' }] } }),
      JSON.stringify({ type: 'toolResult', timestamp: '2026-07-23T08:03:00Z', message: { content: [{ type: 'toolResult', text: 'status: ok' }] } }),
      JSON.stringify({ type: 'compaction', timestamp: '2026-07-23T08:04:00Z', summary: '已压缩早期上下文' })
    ])

    const page = await readJsonlPage({ path: filePath, profileId: 'openclaw-session-v1' })
    const labels = page.entries.flatMap((entry) => entry.tags.map((tag) => tag.label))

    expect(labels).toEqual(expect.arrayContaining(['user', 'assistant', 'toolResult', 'compaction']))
    expect(page.entries[1]).toMatchObject({
      workspace: null,
      contentPreview: '检查 Gateway 状态',
      timestamp: '2026-07-23T08:01:00.000Z'
    })
    const detail = await readJsonlEntry({
      path: filePath,
      profileId: 'openclaw-session-v1',
      offset: page.entries[3].offset,
      byteLength: page.entries[3].byteLength,
      snapshotId: page.file.snapshotId
    })
    expect(detail.formatted).toContain('\n  "message"')
    expect(detail.tags).toContainEqual({ label: 'toolResult', tone: 'neutral' })
  })

  it('browses and searches structured OpenClaw Gateway log entries', async () => {
    const filePath = await makeJsonl([
      JSON.stringify({ time: '2026-07-23T09:00:00Z', level: 'info', subsystem: 'gateway', message: 'Gateway listening on port 18789' }),
      JSON.stringify({ timestamp: '2026-07-23T09:01:00Z', level: 'warn', subsystem: 'gateway', message: 'Gateway retry scheduled' }),
      JSON.stringify({ ts: '2026-07-23T09:02:00Z', level: 'error', subsystem: 'transport', message: 'Gateway connection failed' })
    ])

    const page = await readJsonlPage({ path: filePath, profileId: 'openclaw-gateway-log-v1' })
    expect(page.entries.map((entry) => entry.tags.map((tag) => tag.label))).toEqual([
      expect.arrayContaining(['info', 'gateway']),
      expect.arrayContaining(['warn', 'gateway']),
      expect.arrayContaining(['error', 'transport'])
    ])
    expect(page.entries.map((entry) => entry.contentPreview)).toEqual([
      'Gateway listening on port 18789',
      'Gateway retry scheduled',
      'Gateway connection failed'
    ])

    const detail = await readJsonlEntry({
      path: filePath,
      profileId: 'openclaw-gateway-log-v1',
      offset: page.entries[2].offset,
      byteLength: page.entries[2].byteLength,
      snapshotId: page.file.snapshotId
    })
    expect(detail.formatted).toContain('\n  "message": "Gateway connection failed"')
    expect(detail.tags).toContainEqual({ label: 'error', tone: 'neutral' })

    const searched = await readJsonlPage({
      path: filePath,
      profileId: 'openclaw-gateway-log-v1',
      query: 'retry scheduled'
    })
    expect(searched.entries).toHaveLength(1)
    expect(searched.entries[0]).toMatchObject({
      contentPreview: 'Gateway retry scheduled',
      timestamp: '2026-07-23T09:01:00.000Z'
    })
  })

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
    expect(page.search).toBeNull()
  })

  it('extracts session, workspace, and readable question through declarative profile paths', async () => {
    const filePath = await makeJsonl([
      JSON.stringify({ session_id: 'session-42', ts: 1_774_000_000, text: '为什么模型调用超时？', cwd: '/Users/demo/restx' })
    ])

    const page = await readJsonlPage({ path: filePath, profileId: 'codex-events-v1' })

    expect(page.entries[0]).toMatchObject({
      sessionId: 'session-42',
      workspace: '/Users/demo/restx',
      contentPreview: '为什么模型调用超时？'
    })
  })

  it('searches older records that are not present in the newest page', async () => {
    const filePath = await makeJsonl([
      JSON.stringify({ session_id: 'older-session', ts: 1, text: '模型返回了不可解析的错误' }),
      ...Array.from({ length: 180 }, (_, index) => JSON.stringify({ session_id: `new-${index}`, ts: index + 2, text: `普通问题 ${index}` }))
    ])
    const newest = await readJsonlPage({ path: filePath, profileId: 'codex-events-v1', limit: 20 })
    expect(newest.entries.some((entry) => entry.rawPreview.includes('不可解析'))).toBe(false)

    const searched = await readJsonlPage({ path: filePath, profileId: 'codex-events-v1', query: '不可解析' })

    expect(searched.entries).toHaveLength(1)
    expect(searched.entries[0]).toMatchObject({ sessionId: 'older-session', contentPreview: '模型返回了不可解析的错误' })
    expect(searched.search).toMatchObject({ query: '不可解析', scannedEntries: 181, truncated: false })
    expect(searched.olderCursor).toBeNull()
  })

  it('caps broad searches and reports partial results', async () => {
    const filePath = await makeJsonl(Array.from({ length: 220 }, (_, index) => JSON.stringify({ type: 'user', text: `共同关键词 ${index}` })))

    const searched = await readJsonlPage({ path: filePath, profileId: 'codex-events-v1', query: '共同关键词' })

    expect(searched.entries).toHaveLength(200)
    expect(searched.search?.truncated).toBe(true)
  })

  it('searches every session file in a workspace and identifies each matching file', async () => {
    const firstPath = await makeJsonl([
      JSON.stringify({ timestamp: '2026-07-21T08:00:00Z', session_id: 'one', text: '第一次模型调用报错' })
    ])
    const secondPath = await makeJsonl([
      JSON.stringify({ timestamp: '2026-07-22T09:30:00Z', session_id: 'two', text: '第二次模型调用也报错' })
    ])

    const result = await searchJsonlWorkspace({
      query: '模型调用',
      files: [
        { path: firstPath, profileId: 'codex-events-v1' },
        { path: secondPath, profileId: 'codex-events-v1' }
      ]
    })

    expect(result).toMatchObject({ scannedFiles: 2, totalFiles: 2, truncated: false })
    expect(result.hits).toHaveLength(2)
    expect(result.hits.map((hit) => hit.entry.sessionId)).toEqual(['two', 'one'])
    expect(result.hits.map((hit) => hit.file.path)).toEqual([secondPath, firstPath])
  })

  it('rejects a symbolic-link session in workspace search', async () => {
    const filePath = await makeJsonl(['{"text":"模型调用"}'])
    const linkedPath = path.join(path.dirname(filePath), 'workspace-linked.jsonl')
    await symlink(filePath, linkedPath)

    await expect(searchJsonlWorkspace({
      query: '模型调用', files: [{ path: linkedPath, profileId: 'codex-events-v1' }]
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' })
  })

  it('rejects blank or control-character search input', async () => {
    const filePath = await makeJsonl(['{"type":"user"}'])

    await expect(readJsonlPage({ path: filePath, profileId: 'codex-events-v1', query: ' \n ' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
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
    expect(page.entries[1]).toMatchObject({ sessionId: null, workspace: null, contentPreview: null })
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
