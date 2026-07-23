import { lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { ScanCandidate, ScanOptions, ScanResult, SkippedEntry } from '../../shared/contracts/inspector'
import { discoverAiTools } from './ai-tool-discovery'
import { getRegisteredAiToolPresets } from '../presets/ai-tools'
import { refreshAiToolPresetRegistry } from './user-preset-store'
import type { PresetPathEnvironment } from './preset-path-resolver'

const DEFAULTS = {
  maxDepth: 8,
  maxFiles: 10_000,
  maxFileSizeBytes: 20 * 1024 * 1024
}

const IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'out', 'build', 'coverage',
  '.next', '.cache', 'target', 'vendor', '__pycache__'
])
const CONFIG_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.toml', '.ini'])
const LOG_EXTENSIONS = new Set(['.log', '.out', '.err'])
const TEXT_EXTENSIONS = new Set(['.txt', '.log', '.out', '.err', '.json', '.yaml', '.yml', '.toml', '.ini', '.md'])
const LIKELY_CONFIG_NAME = /(?:^|[._-])(config|settings?|preferences?|profile|mcp|claude|codex|cursor|openai|anthropic|restx|ai)(?:[._-]|$)/i

export type ScanDependencies = {
  authorizeRoot?: (directory: string) => Promise<unknown>
  pathEnvironment?: PresetPathEnvironment
}

export class ScanError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ScanError'
  }
}

export function classifyCandidate(fileName: string, insideLogsDirectory: boolean): Pick<ScanCandidate, 'kind' | 'viewer' | 'matchedBy'> | null {
  const lowerName = fileName.toLowerCase()
  const extension = path.extname(lowerName)

  if (LOG_EXTENSIONS.has(extension)) return { kind: 'log', viewer: 'metadata', matchedBy: `日志扩展名 ${extension}` }
  if (lowerName.includes('log')) return { kind: 'log', viewer: 'metadata', matchedBy: '文件名包含 log' }
  if (insideLogsDirectory && (TEXT_EXTENSIONS.has(extension) || extension === '')) {
    return { kind: 'log', viewer: 'metadata', matchedBy: '位于 logs 目录中的文本文件' }
  }
  if (lowerName === '.env') return { kind: 'config', viewer: 'config', matchedBy: '环境配置文件 .env' }
  if (lowerName.startsWith('config.')) return { kind: 'config', viewer: 'config', matchedBy: '文件名匹配 config.*' }
  if (lowerName.startsWith('settings.')) return { kind: 'config', viewer: 'config', matchedBy: '文件名匹配 settings.*' }
  if (CONFIG_EXTENSIONS.has(extension)) return { kind: 'config', viewer: 'config', matchedBy: `配置扩展名 ${extension}` }
  return null
}

function pushSkipped(entries: SkippedEntry[], entry: SkippedEntry): void {
  if (entries.length < 200) entries.push(entry)
}

function candidatePriority(candidate: ScanCandidate): number {
  if (candidate.kind === 'log') return 100
  if (candidate.kind === 'history') return 90
  if (candidate.kind === 'conversation') return 80
  if (candidate.kind === 'instruction') return 20
  const lower = candidate.name.toLowerCase()
  if (lower === '.env' || lower.startsWith('config.') || lower.startsWith('settings.')) return 0
  if (LIKELY_CONFIG_NAME.test(lower)) return 10
  return 50
}

export function sortScanCandidates(candidates: ScanCandidate[], rootPath: string): void {
  candidates.sort((a, b) => {
    const priority = candidatePriority(a) - candidatePriority(b)
    if (priority !== 0) return priority
    if (a.kind === b.kind && (a.kind === 'conversation' || a.kind === 'history' || a.kind === 'log')) {
      const modifiedOrder = Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt)
      if (modifiedOrder !== 0) return modifiedOrder
    }
    const aDepth = path.relative(rootPath, a.path).split(path.sep).length
    const bDepth = path.relative(rootPath, b.path).split(path.sep).length
    if (aDepth !== bDepth) return aDepth - bDepth
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  })
}

export async function scanDirectory(
  inputPath: string,
  options: ScanOptions = {},
  dependencies: ScanDependencies = {}
): Promise<ScanResult> {
  const startedAt = new Date().toISOString()
  const limits = { ...DEFAULTS, ...options }
  const normalizedInput = path.resolve(inputPath)
  let rootPath: string

  try {
    rootPath = await realpath(normalizedInput)
    const rootStat = await lstat(rootPath)
    if (!rootStat.isDirectory()) throw new ScanError('所选路径不是文件夹。', 'NOT_DIRECTORY')
  } catch (error) {
    if (error instanceof ScanError) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM') throw new ScanError('没有权限读取所选文件夹。', 'PERMISSION_DENIED')
    if (code === 'ENOENT') throw new ScanError('所选文件夹不存在或已被移动。', 'NOT_FOUND')
    throw new ScanError('无法打开所选文件夹。', 'UNAVAILABLE')
  }

  await refreshAiToolPresetRegistry()
  const discovery = await discoverAiTools(rootPath, limits, getRegisteredAiToolPresets(), dependencies.pathEnvironment)
  for (const authorizationRoot of discovery.authorizationRoots) await dependencies.authorizeRoot?.(authorizationRoot)
  const candidates: ScanCandidate[] = [...discovery.candidates]
  const skipped: SkippedEntry[] = [...discovery.skipped]
  let scannedFileCount = discovery.scannedFileCount
  let limitReached = scannedFileCount >= limits.maxFiles

  async function walk(directory: string, depth: number, insideLogsDirectory: boolean): Promise<void> {
    if (limitReached) return
    if (depth > limits.maxDepth) {
      pushSkipped(skipped, { path: directory, reason: `超过最大扫描深度 ${limits.maxDepth}` })
      return
    }

    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      pushSkipped(skipped, { path: directory, reason: code === 'EACCES' || code === 'EPERM' ? '无读取权限' : '读取失败' })
      return
    }

    for (const entry of entries) {
      if (limitReached) break
      const entryPath = path.join(directory, entry.name)

      if (entry.isSymbolicLink()) {
        pushSkipped(skipped, { path: entryPath, reason: '跳过符号链接' })
        continue
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name.toLowerCase()) || entry.name.startsWith('.')) {
          pushSkipped(skipped, { path: entryPath, reason: '忽略的目录' })
          continue
        }
        await walk(entryPath, depth + 1, insideLogsDirectory || entry.name.toLowerCase() === 'logs')
        continue
      }
      if (!entry.isFile()) continue

      scannedFileCount += 1
      if (scannedFileCount >= limits.maxFiles) {
        limitReached = true
        pushSkipped(skipped, { path: rootPath, reason: `已达到 ${limits.maxFiles} 个文件的扫描上限` })
      }

      const classification = classifyCandidate(entry.name, insideLogsDirectory)
      if (!classification) continue

      try {
        const stat = await lstat(entryPath)
        if (stat.size > limits.maxFileSizeBytes) {
          pushSkipped(skipped, { path: entryPath, reason: `文件超过 ${Math.round(limits.maxFileSizeBytes / 1024 / 1024)} MB 上限` })
          continue
        }
        candidates.push({
          path: entryPath,
          name: entry.name,
          ...classification,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString()
        })
      } catch {
        pushSkipped(skipped, { path: entryPath, reason: '无法读取文件元数据' })
      }
    }
  }

  if (!discovery.tools.some((tool) => tool.status === 'detected')) {
    await walk(rootPath, 0, path.basename(rootPath).toLowerCase() === 'logs')
  }
  sortScanCandidates(candidates, rootPath)

  return {
    rootPath,
    startedAt,
    completedAt: new Date().toISOString(),
    scannedFileCount,
    candidates,
    tools: discovery.tools,
    skipped
  }
}
