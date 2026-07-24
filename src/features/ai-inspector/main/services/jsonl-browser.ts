import { open, lstat } from 'node:fs/promises'
import path from 'node:path'
import type {
  JsonlEntryDetail,
  JsonlEntryRequest,
  JsonlEventSummary,
  JsonlPage,
  JsonlPageRequest,
  JsonlTag,
  JsonlWorkspaceSearchRequest,
  JsonlWorkspaceSearchResult
} from '../../shared/contracts/jsonl'
import type { ConversationSessionSummary } from '../../shared/contracts/inspector'
import { findJsonlProfile, type JsonlProfile } from '../presets/ai-tools'

const PAGE_BYTES = 2 * 1024 * 1024
const MAX_ENTRY_BYTES = 1024 * 1024
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200
const PREVIEW_CHARACTERS = 800
const CONTENT_PREVIEW_CHARACTERS = 500
const SEARCH_MAX_BYTES = 256 * 1024 * 1024
const SEARCH_MAX_ENTRIES = 250_000
const SEARCH_MAX_RESULTS = 200
const SESSION_SUMMARY_BYTES = 512 * 1024
const SESSION_SUMMARY_LINES = 300
const WORKSPACE_MAX_FILES = 200
const WORKSPACE_REQUEST_MAX_FILES = 500

export class JsonlBrowserError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'JsonlBrowserError'
  }
}

type LineSlice = { offset: number; byteLength: number; bytes: Buffer }

function getProfile(profileId: string): JsonlProfile {
  const profile = findJsonlProfile(profileId)
  if (!profile) throw new JsonlBrowserError('未知的 JSONL 解析预置。', 'UNKNOWN_PROFILE')
  return profile
}

async function inspectFile(filePath: string, profile: JsonlProfile) {
  const supportedExtensions = new Set(['.jsonl', ...(profile.fileExtensions ?? [])])
  if (!supportedExtensions.has(path.extname(filePath).toLowerCase())) {
    throw new JsonlBrowserError('文件扩展名不受当前 JSONL 解析预置支持。', 'UNSUPPORTED_FILE')
  }
  const stat = await lstat(filePath)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new JsonlBrowserError('目标不是可读的普通文件。', 'UNSUPPORTED_FILE')
  }
  return {
    stat,
    snapshotId: `${stat.size}:${Math.trunc(stat.mtimeMs)}:${stat.ino}`
  }
}

function parseInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value)) throw new JsonlBrowserError(`${name} 无效。`, 'INVALID_REQUEST')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new JsonlBrowserError(`${name} 超出范围。`, 'INVALID_REQUEST')
  return parsed
}

function splitPath(expression: string): string[] {
  return expression.replace(/\[\*\]/g, '.[*]').split('.')
}

function valuesAtPath(value: unknown, expression: string): unknown[] {
  let current: unknown[] = [value]
  for (const segment of splitPath(expression)) {
    if (segment === '[*]') {
      current = current.flatMap((item) => Array.isArray(item) ? item : [])
    } else {
      current = current.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        return segment in item ? [(item as Record<string, unknown>)[segment]] : []
      })
    }
  }
  return current
}

function rawLabel(value: unknown): string | null {
  if (!['string', 'number', 'boolean'].includes(typeof value)) return null
  const label = String(value).trim()
  if (!label) return null
  return label.length > 40 ? `${label.slice(0, 37)}…` : label
}

function profileText(value: unknown, paths: readonly string[] | undefined, maxCharacters: number): string | null {
  for (const valuePath of paths ?? []) {
    for (const candidate of valuesAtPath(value, valuePath)) {
      if (!['string', 'number', 'boolean'].includes(typeof candidate)) continue
      const text = String(candidate).replace(/\s+/g, ' ').trim()
      if (!text) continue
      return text.length > maxCharacters ? `${text.slice(0, maxCharacters - 1)}…` : text
    }
  }
  return null
}

export function extractJsonlTags(value: unknown, profile: JsonlProfile): JsonlTag[] {
  const tags: JsonlTag[] = []
  const seen = new Set<string>()
  for (const rule of profile.tagRules) {
    for (const candidate of valuesAtPath(value, rule.path)) {
      const mapped = rule.values?.[String(candidate)]
      const tag = mapped ?? (rule.fallback === 'raw-value' ? { label: rawLabel(candidate), tone: 'neutral' as const } : null)
      if (!tag?.label) continue
      const key = `${tag.tone}:${tag.label}`
      if (!seen.has(key)) {
        seen.add(key)
        tags.push({ label: tag.label, tone: tag.tone })
      }
    }
  }
  return tags.length > 0 ? tags.slice(0, 6) : [{ label: '记录', tone: 'neutral' }]
}

function extractTimestamp(value: unknown, profile: JsonlProfile): string | null {
  for (const timestampPath of profile.timestampPaths) {
    for (const candidate of valuesAtPath(value, timestampPath)) {
      let milliseconds: number | null = null
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        milliseconds = Math.abs(candidate) < 1_000_000_000_000 ? candidate * 1000 : candidate
      } else if (typeof candidate === 'string' && candidate.trim()) {
        const numeric = Number(candidate)
        milliseconds = Number.isFinite(numeric)
          ? (Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric)
          : Date.parse(candidate)
      }
      if (milliseconds !== null && Number.isFinite(milliseconds)) return new Date(milliseconds).toISOString()
    }
  }
  return null
}

function summarizeLine(line: LineSlice, profile: JsonlProfile): JsonlEventSummary {
  const withoutCarriageReturn = line.bytes.at(-1) === 13 ? line.bytes.subarray(0, -1) : line.bytes
  const rawPreview = withoutCarriageReturn.toString('utf8').replace(/^\uFFFD+/, '').slice(0, PREVIEW_CHARACTERS)
  if (line.byteLength > MAX_ENTRY_BYTES) {
    return {
      offset: String(line.offset), byteLength: line.byteLength, rawPreview, timestamp: null,
      sessionId: null, workspace: null, contentPreview: null,
      tags: [{ label: '超大记录', tone: 'error' }], parseStatus: 'oversized'
    }
  }
  try {
    const value: unknown = JSON.parse(withoutCarriageReturn.toString('utf8'))
    return {
      offset: String(line.offset), byteLength: line.byteLength, rawPreview,
      timestamp: extractTimestamp(value, profile),
      sessionId: profileText(value, profile.sessionPaths, 200),
      workspace: profileText(value, profile.workspacePaths, 500),
      contentPreview: profileText(value, profile.summaryPaths, CONTENT_PREVIEW_CHARACTERS),
      tags: extractJsonlTags(value, profile), parseStatus: 'valid'
    }
  } catch {
    return {
      offset: String(line.offset), byteLength: line.byteLength, rawPreview, timestamp: null,
      sessionId: null, workspace: null, contentPreview: null,
      tags: [{ label: '格式异常', tone: 'error' }], parseStatus: 'invalid'
    }
  }
}

export async function readJsonlSessionSummary({
  path: filePath, profileId
}: {
  path: string
  profileId: string
}): Promise<ConversationSessionSummary> {
  const profile = getProfile(profileId)
  const { stat } = await inspectFile(filePath, profile)
  const length = Math.min(stat.size, SESSION_SUMMARY_BYTES)
  const buffer = Buffer.alloc(length)
  const handle = await open(filePath, 'r')
  try {
    if (length > 0) await handle.read(buffer, 0, length, 0)
  } finally {
    await handle.close()
  }
  const entries = splitLines(buffer, 0, true).slice(0, SESSION_SUMMARY_LINES).map((line) => summarizeLine(line, profile))
  let sessionId: string | null = null
  let workspace: string | null = null
  let title: string | null = null
  let fallbackTitle: string | null = null
  let startedAt: string | null = null
  for (const entry of entries) {
    sessionId ??= entry.sessionId
    workspace ??= entry.workspace
    fallbackTitle ??= entry.contentPreview
    if (!title && entry.contentPreview && entry.tags.some((tag) => tag.tone === 'user')) title = entry.contentPreview
    if (entry.timestamp && (!startedAt || entry.timestamp < startedAt)) startedAt = entry.timestamp
    if (sessionId && workspace && title && startedAt) break
  }
  return { sessionId, workspace, title: title ?? fallbackTitle, startedAt }
}

async function searchJsonl({
  filePath, profile, size, query, maxBytes = SEARCH_MAX_BYTES,
  maxEntries = SEARCH_MAX_ENTRIES, maxResults = SEARCH_MAX_RESULTS
}: {
  filePath: string
  profile: JsonlProfile
  size: number
  query: string
  maxBytes?: number
  maxEntries?: number
  maxResults?: number
}): Promise<{ entries: JsonlEventSummary[]; scannedEntries: number; scannedBytes: number; truncated: boolean }> {
  const entries: JsonlEventSummary[] = []
  const normalizedQuery = query.toLowerCase()
  let cursor = size
  let scannedEntries = 0
  let scannedBytes = 0
  let truncated = false
  const handle = await open(filePath, 'r')
  try {
    while (cursor > 0 && scannedEntries < maxEntries && scannedBytes < maxBytes && entries.length < maxResults) {
      const chunkBytes = Math.min(PAGE_BYTES, maxBytes - scannedBytes)
      const start = Math.max(0, cursor - chunkBytes)
      const length = cursor - start
      const buffer = Buffer.alloc(length)
      if (length > 0) await handle.read(buffer, 0, length, start)
      scannedBytes += length

      const lines = splitLines(buffer, start, start === 0)
      const firstNewline = start === 0 ? -1 : buffer.indexOf(10)
      const candidateCursor = firstNewline >= 0 ? start + firstNewline + 1 : start
      const nextCursor = start === 0 ? 0 : (candidateCursor < cursor ? candidateCursor : start)

      let unscannedLines = false
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (scannedEntries >= maxEntries || entries.length >= maxResults) {
          unscannedLines = true
          break
        }
        const line = lines[index]
        scannedEntries += 1
        if (line.bytes.toString('utf8').toLowerCase().includes(normalizedQuery)) entries.push(summarizeLine(line, profile))
        if (entries.length >= maxResults && index > 0) unscannedLines = true
      }

      cursor = nextCursor
      if (unscannedLines) {
        truncated = true
        break
      }
    }
    truncated = truncated || cursor > 0
  } finally {
    await handle.close()
  }
  return { entries, scannedEntries, scannedBytes: Math.min(scannedBytes, size), truncated }
}

export async function searchJsonlWorkspace(request: JsonlWorkspaceSearchRequest): Promise<JsonlWorkspaceSearchResult> {
  const query = request.query.trim()
  if (!query || query.length > 200 || /[\u0000-\u001F\u007F]/.test(query)) {
    throw new JsonlBrowserError('搜索内容无效，请输入 1 至 200 个可见字符。', 'INVALID_REQUEST')
  }
  if (request.files.length === 0 || request.files.length > WORKSPACE_REQUEST_MAX_FILES) {
    throw new JsonlBrowserError('Workspace 会话文件数量无效。', 'INVALID_REQUEST')
  }
  const uniqueFiles = [...new Map(request.files.map((file) => [file.path, file])).values()]
  const inspected = []
  for (const file of uniqueFiles) {
    const profile = getProfile(file.profileId)
    const { stat, snapshotId } = await inspectFile(file.path, profile)
    inspected.push({ ...file, profile, stat, snapshotId })
  }
  inspected.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs)

  const hits: JsonlWorkspaceSearchResult['hits'] = []
  let scannedFiles = 0
  let scannedEntries = 0
  let scannedBytes = 0
  let truncated = inspected.length > WORKSPACE_MAX_FILES
  for (const file of inspected.slice(0, WORKSPACE_MAX_FILES)) {
    const remainingBytes = SEARCH_MAX_BYTES - scannedBytes
    const remainingEntries = SEARCH_MAX_ENTRIES - scannedEntries
    const remainingResults = SEARCH_MAX_RESULTS - hits.length
    if (remainingBytes <= 0 || remainingEntries <= 0 || remainingResults <= 0) {
      truncated = true
      break
    }
    const result = await searchJsonl({
      filePath: file.path, profile: file.profile, size: file.stat.size, query,
      maxBytes: remainingBytes, maxEntries: remainingEntries, maxResults: remainingResults
    })
    scannedFiles += 1
    scannedEntries += result.scannedEntries
    scannedBytes += result.scannedBytes
    hits.push(...result.entries.map((entry) => ({
      file: {
        path: file.path,
        name: path.basename(file.path),
        modifiedAt: file.stat.mtime.toISOString(),
        snapshotId: file.snapshotId
      },
      entry
    })))
    if (result.truncated) {
      truncated = true
      break
    }
  }
  if (scannedFiles < inspected.length) truncated = true
  hits.sort((left, right) =>
    (right.entry.timestamp ?? right.file.modifiedAt).localeCompare(left.entry.timestamp ?? left.file.modifiedAt)
  )
  return {
    query, hits, scannedFiles, totalFiles: inspected.length,
    scannedEntries, scannedBytes, truncated
  }
}

function splitLines(buffer: Buffer, globalStart: number, includesFileStart: boolean): LineSlice[] {
  const lines: LineSlice[] = []
  let lineStart = 0
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 10) continue
    if (includesFileStart || lineStart > 0) {
      const bytes = buffer.subarray(lineStart, index)
      if (bytes.length > 0) lines.push({ offset: globalStart + lineStart, byteLength: bytes.length, bytes })
    }
    lineStart = index + 1
  }
  if (lineStart < buffer.length && (includesFileStart || lineStart > 0)) {
    const bytes = buffer.subarray(lineStart)
    if (bytes.length > 0) lines.push({ offset: globalStart + lineStart, byteLength: bytes.length, bytes })
  }
  return lines
}

export async function readJsonlPage(request: JsonlPageRequest): Promise<JsonlPage> {
  const profile = getProfile(request.profileId)
  const { stat, snapshotId } = await inspectFile(request.path, profile)
  if (request.query !== undefined) {
    const query = request.query.trim()
    if (!query || query.length > 200 || /[\u0000-\u001F\u007F]/.test(query)) {
      throw new JsonlBrowserError('搜索内容无效，请输入 1 至 200 个可见字符。', 'INVALID_REQUEST')
    }
    if (request.cursor !== undefined) throw new JsonlBrowserError('搜索请求不能包含 cursor。', 'INVALID_REQUEST')
    const result = await searchJsonl({ filePath: request.path, profile, size: stat.size, query })
    return {
      file: {
        path: request.path, name: path.basename(request.path), sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(), snapshotId
      },
      entries: result.entries,
      olderCursor: null,
      changed: request.snapshotId !== undefined && request.snapshotId !== snapshotId,
      search: { query, scannedEntries: result.scannedEntries, scannedBytes: result.scannedBytes, truncated: result.truncated }
    }
  }
  const end = parseInteger(request.cursor, stat.size, 'cursor')
  if (end > stat.size) throw new JsonlBrowserError('cursor 超出文件范围。', 'INVALID_REQUEST')
  const limit = Math.min(MAX_LIMIT, Math.max(1, request.limit ?? DEFAULT_LIMIT))
  const start = Math.max(0, end - PAGE_BYTES)
  const length = end - start
  const buffer = Buffer.alloc(length)
  const handle = await open(request.path, 'r')
  try {
    if (length > 0) await handle.read(buffer, 0, length, start)
  } finally {
    await handle.close()
  }
  let allLines = splitLines(buffer, start, start === 0)
  const partialOversizedTail = allLines.length === 0 && start > 0 && buffer.length > 0
  if (partialOversizedTail) allLines = [{ offset: start, byteLength: buffer.length, bytes: buffer }]
  const selectedLines = allLines.slice(-limit)
  const entries = selectedLines.map((line) => summarizeLine(line, profile))
  const earliestOffset = selectedLines[0]?.offset ?? end
  const hasOlderData = !partialOversizedTail && (start > 0 || allLines.length > selectedLines.length)
  return {
    file: {
      path: request.path, name: path.basename(request.path), sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(), snapshotId
    },
    entries,
    olderCursor: hasOlderData ? String(earliestOffset) : null,
    changed: request.snapshotId !== undefined && request.snapshotId !== snapshotId,
    search: null
  }
}

export async function readJsonlEntry(request: JsonlEntryRequest): Promise<JsonlEntryDetail> {
  const profile = getProfile(request.profileId)
  const { stat, snapshotId } = await inspectFile(request.path, profile)
  if (request.snapshotId !== snapshotId) throw new JsonlBrowserError('文件已更新，请刷新记录列表。', 'FILE_CHANGED')
  const offset = parseInteger(request.offset, 0, 'offset')
  if (!Number.isSafeInteger(request.byteLength) || request.byteLength < 0 || offset + request.byteLength > stat.size) {
    throw new JsonlBrowserError('记录位置无效。', 'INVALID_REQUEST')
  }
  const length = Math.min(request.byteLength, MAX_ENTRY_BYTES)
  const buffer = Buffer.alloc(length)
  const handle = await open(request.path, 'r')
  try {
    if (length > 0) await handle.read(buffer, 0, length, offset)
  } finally {
    await handle.close()
  }
  const raw = (buffer.at(-1) === 13 ? buffer.subarray(0, -1) : buffer).toString('utf8')
  let formatted: string | null = null
  let parseError: string | null = null
  let tags: JsonlTag[] = [{ label: '记录', tone: 'neutral' }]
  if (request.byteLength > MAX_ENTRY_BYTES) {
    parseError = `单条记录超过 ${MAX_ENTRY_BYTES / 1024 / 1024} MiB，仅显示前部分。`
    tags = [{ label: '超大记录', tone: 'error' }]
  } else {
    try {
      const value: unknown = JSON.parse(raw)
      formatted = JSON.stringify(value, null, 2)
      tags = extractJsonlTags(value, profile)
    } catch (error) {
      parseError = error instanceof Error ? error.message : 'JSON 解析失败'
      tags = [{ label: '格式异常', tone: 'error' }]
    }
  }
  return { offset: request.offset, raw, formatted, tags, parseError, truncated: request.byteLength > MAX_ENTRY_BYTES }
}
