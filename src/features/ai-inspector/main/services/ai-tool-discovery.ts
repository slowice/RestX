import { lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import type {
  CandidateKind,
  DetectedAiTool,
  ScanCandidate,
  SkippedEntry,
  ToolCandidateCounts,
  ToolFolderNode
} from '../../shared/contracts/inspector'
import { AI_TOOL_PRESETS, type AiToolMatchRule, type AiToolPreset, type AiToolProbe, type AiToolSource } from '../presets/ai-tools'
import { validateAiToolPresets } from '../presets/ai-tools/validator'
import { readJsonlSessionSummary } from './jsonl-browser'
import { resolvePresetPaths, type PresetPathEnvironment } from './preset-path-resolver'

export { validateAiToolPresets } from '../presets/ai-tools/validator'

export type ToolDiscoveryOptions = {
  maxFiles: number
  maxFileSizeBytes: number
}

export type ToolDiscoveryResult = {
  tools: DetectedAiTool[]
  candidates: ScanCandidate[]
  skipped: SkippedEntry[]
  scannedFileCount: number
  authorizationRoots: string[]
}

const KIND_NAMES: Record<CandidateKind, string> = {
  config: '配置',
  instruction: '指令',
  conversation: '会话记录',
  history: '活动历史',
  log: '日志'
}

function emptyCounts(): ToolCandidateCounts {
  return { config: 0, instruction: 0, conversation: 0, history: 0, log: 0 }
}

function normalizedRelative(value: string): string {
  return value.split(path.sep).join('/')
}

function isOutsideRoot(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
}

function isBuiltInPreset(preset: AiToolPreset): boolean {
  return AI_TOOL_PRESETS.includes(preset)
}

async function resolvePresetDeclaration(
  rootPath: string,
  preset: AiToolPreset,
  declaration: AiToolProbe | AiToolSource,
  pathEnvironment?: PresetPathEnvironment
): Promise<string[]> {
  if (typeof declaration.path === 'string' && !isBuiltInPreset(preset)) return []
  return resolvePresetPaths(rootPath, declaration, pathEnvironment)
}

function globToRegExp(glob: string): RegExp {
  let pattern = '^'
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index]
    if (character === '*') {
      if (glob[index + 1] === '*') {
        index += 1
        if (glob[index + 1] === '/') {
          index += 1
          pattern += '(?:.*/)?'
        } else pattern += '.*'
      } else pattern += '[^/]*'
      continue
    }
    if (character === '?') {
      pattern += '[^/]'
      continue
    }
    pattern += character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  }
  return new RegExp(`${pattern}$`, 'i')
}

export function matchesPresetGlob(glob: string, relativePath: string): boolean {
  return globToRegExp(glob).test(normalizedRelative(relativePath))
}

function pushSkipped(skipped: SkippedEntry[], entry: SkippedEntry): void {
  if (skipped.length < 200) skipped.push(entry)
}

async function detectPreset(
  rootPath: string,
  preset: AiToolPreset,
  skipped: SkippedEntry[],
  pathEnvironment?: PresetPathEnvironment
): Promise<DetectedAiTool['evidence']> {
  const evidence: DetectedAiTool['evidence'] = []
  for (const probe of preset.probes) {
    for (const probePath of await resolvePresetDeclaration(rootPath, preset, probe, pathEnvironment)) {
      try {
        const stat = await lstat(probePath)
        if (stat.isSymbolicLink()) {
          pushSkipped(skipped, { path: probePath, reason: `${preset.displayName} 探针是符号链接` })
          continue
        }
        const matches = probe.entryType === 'directory' ? stat.isDirectory() : stat.isFile()
        if (matches) evidence.push({ path: probePath, entryType: probe.entryType })
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EACCES' || code === 'EPERM') pushSkipped(skipped, { path: probePath, reason: `${preset.displayName} 探针无读取权限` })
      }
    }
  }
  return evidence
}

function excludedBy(source: AiToolSource, relativePath: string): boolean {
  return (source.excludes ?? []).some((glob) =>
    matchesPresetGlob(glob, relativePath) || matchesPresetGlob(glob, `${relativePath}/`)
  )
}

function matchingRule(source: AiToolSource, relativePath: string): AiToolMatchRule | null {
  return source.patterns.find((rule) => matchesPresetGlob(rule.glob, relativePath)) ?? null
}

function buildFolders(candidates: ScanCandidate[]): { counts: ToolCandidateCounts; folders: ToolFolderNode[] } {
  const counts = emptyCounts()
  for (const candidate of candidates) counts[candidate.kind] += 1
  const folders = (Object.keys(KIND_NAMES) as CandidateKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind): ToolFolderNode => {
      const files = candidates.filter((candidate) => candidate.kind === kind)
      return {
        id: kind,
        name: KIND_NAMES[kind],
        path: null,
        role: 'category',
        kind,
        counts: { ...emptyCounts(), [kind]: counts[kind] },
        children: kind === 'conversation' ? buildWorkspaceFolders(files) : [],
        files
      }
    })
  return { counts, folders }
}

function buildWorkspaceFolders(files: ScanCandidate[]): ToolFolderNode[] {
  const grouped = new Map<string, ScanCandidate[]>()
  for (const file of files) {
    const workspace = file.session?.workspace?.trim() || '__unknown_workspace__'
    const current = grouped.get(workspace) ?? []
    current.push(file)
    grouped.set(workspace, current)
  }
  return [...grouped].map(([workspace, sessions], index): ToolFolderNode => {
    const unknown = workspace === '__unknown_workspace__'
    sessions.sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt))
    return {
      id: `conversation-workspace-${index}`,
      name: unknown ? '未知工作区' : workspaceName(workspace),
      path: unknown ? null : workspace,
      role: 'physical',
      kind: 'conversation',
      counts: { ...emptyCounts(), conversation: sessions.length },
      children: [],
      files: sessions
    }
  }).sort((left, right) => {
    const leftTime = Date.parse(left.files[0]?.modifiedAt ?? '') || 0
    const rightTime = Date.parse(right.files[0]?.modifiedAt ?? '') || 0
    return rightTime - leftTime || left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true })
  })
}

function workspaceName(workspace: string): string {
  const normalized = workspace.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).pop() || workspace
}

async function enrichConversationSessions(candidates: ScanCandidate[], skipped: SkippedEntry[]): Promise<void> {
  const sessions = candidates.filter((candidate) => candidate.kind === 'conversation' && candidate.viewer === 'jsonl' && candidate.jsonlProfileId)
  let nextIndex = 0
  const workerCount = Math.min(8, sessions.length)
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < sessions.length) {
      const candidate = sessions[nextIndex]
      nextIndex += 1
      try {
        candidate.session = await readJsonlSessionSummary({ path: candidate.path, profileId: candidate.jsonlProfileId! })
      } catch {
        candidate.session = { sessionId: null, workspace: null, title: null, startedAt: null }
        pushSkipped(skipped, { path: candidate.path, reason: '无法读取会话摘要，已归入未知工作区' })
      }
    }
  }))
}

export async function discoverAiTools(
  rootPath: string,
  options: ToolDiscoveryOptions,
  presets: readonly AiToolPreset[] = AI_TOOL_PRESETS,
  pathEnvironment?: PresetPathEnvironment
): Promise<ToolDiscoveryResult> {
  validateAiToolPresets(presets)
  const scanRootPath = await realpath(rootPath).catch(() => rootPath)
  const skipped: SkippedEntry[] = []
  const detected = await Promise.all(presets.map(async (preset) => ({
    preset,
    evidence: await detectPreset(scanRootPath, preset, skipped, pathEnvironment)
  })))
  const candidates: ScanCandidate[] = []
  const candidatePaths = new Set<string>()
  const authorizationRoots = new Set<string>()
  let scannedFileCount = 0
  let limitReached = false

  async function addFile(filePath: string, relativePath: string, preset: AiToolPreset, source: AiToolSource): Promise<void> {
    if (limitReached || excludedBy(source, relativePath)) return
    scannedFileCount += 1
    if (scannedFileCount >= options.maxFiles) {
      limitReached = true
      pushSkipped(skipped, { path: scanRootPath, reason: `已达到 ${options.maxFiles} 个文件的扫描上限` })
    }
    const rule = matchingRule(source, relativePath)
    if (!rule || candidatePaths.has(filePath)) return
    try {
      const stat = await lstat(filePath)
      if (!stat.isFile() || stat.isSymbolicLink()) return
      if (rule.viewer !== 'jsonl' && stat.size > options.maxFileSizeBytes) {
        pushSkipped(skipped, { path: filePath, reason: `文件超过 ${Math.round(options.maxFileSizeBytes / 1024 / 1024)} MB 上限` })
        return
      }
      candidatePaths.add(filePath)
      candidates.push({
        path: filePath,
        name: path.basename(filePath),
        kind: rule.kind,
        viewer: rule.viewer,
        jsonlProfileId: rule.jsonlProfileId,
        matchedBy: `${preset.displayName} 预置 · ${rule.label}`,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        toolId: preset.id,
        sourceId: source.id,
        relativePath: normalizedRelative(path.relative(scanRootPath, filePath))
      })
    } catch {
      pushSkipped(skipped, { path: filePath, reason: '无法读取文件元数据' })
    }
  }

  async function walkSource(
    directory: string,
    sourceRoot: string,
    depth: number,
    preset: AiToolPreset,
    source: AiToolSource
  ): Promise<void> {
    if (limitReached || depth > source.maxDepth) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') pushSkipped(skipped, { path: directory, reason: code === 'EACCES' || code === 'EPERM' ? '无读取权限' : '读取失败' })
      return
    }
    for (const entry of entries) {
      if (limitReached) return
      const entryPath = path.join(directory, entry.name)
      const relativePath = normalizedRelative(path.relative(sourceRoot, entryPath))
      if (excludedBy(source, relativePath)) continue
      if (entry.isSymbolicLink()) {
        pushSkipped(skipped, { path: entryPath, reason: '跳过符号链接' })
      } else if (entry.isDirectory()) {
        await walkSource(entryPath, sourceRoot, depth + 1, preset, source)
      } else if (entry.isFile()) {
        await addFile(entryPath, relativePath, preset, source)
      }
    }
  }

  for (const item of detected) {
    if (item.evidence.length === 0) continue
    const scannedSourcePaths = new Set<string>()
    for (const source of item.preset.sources) {
      if (limitReached) break
      for (const sourcePath of await resolvePresetDeclaration(scanRootPath, item.preset, source, pathEnvironment)) {
        if (limitReached) break
        try {
          const stat = await lstat(sourcePath)
          if (stat.isSymbolicLink()) {
            pushSkipped(skipped, { path: sourcePath, reason: '跳过符号链接来源' })
            continue
          }
          const sourceRealPath = await realpath(sourcePath)
          if (scannedSourcePaths.has(sourceRealPath)) continue
          scannedSourcePaths.add(sourceRealPath)
          const authorizationRoot = stat.isFile() ? path.dirname(sourceRealPath) : sourceRealPath
          if (isOutsideRoot(scanRootPath, authorizationRoot)) authorizationRoots.add(authorizationRoot)
          if (stat.isFile()) {
            await addFile(sourceRealPath, path.basename(sourceRealPath), item.preset, source)
          } else if (stat.isDirectory()) {
            await walkSource(sourceRealPath, sourceRealPath, 0, item.preset, source)
          }
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code
          if (code === 'EACCES' || code === 'EPERM') pushSkipped(skipped, { path: sourcePath, reason: '无读取权限' })
        }
      }
    }
  }

  await enrichConversationSessions(candidates, skipped)

  const presetOrder = new Map(presets.map((preset, index) => [preset.id, index]))
  const kindOrder: Record<CandidateKind, number> = { config: 0, instruction: 1, conversation: 2, history: 3, log: 4 }
  candidates.sort((left, right) =>
    (presetOrder.get(left.toolId ?? '') ?? 999) - (presetOrder.get(right.toolId ?? '') ?? 999) ||
    kindOrder[left.kind] - kindOrder[right.kind] ||
    ((left.kind === 'conversation' || left.kind === 'history' || left.kind === 'log')
      ? Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt)
      : (left.relativePath ?? left.name).localeCompare(right.relativePath ?? right.name, undefined, { sensitivity: 'base', numeric: true }))
  )

  const tools = detected.map(({ preset, evidence }): DetectedAiTool => {
    const owned = candidates.filter((candidate) => candidate.toolId === preset.id)
    const grouped = buildFolders(owned)
    return {
      id: preset.id,
      displayName: preset.displayName,
      status: evidence.length > 0 ? 'detected' : 'not-detected',
      evidence,
      counts: grouped.counts,
      folders: grouped.folders
    }
  })

  return { tools, candidates, skipped, scannedFileCount, authorizationRoots: [...authorizationRoots] }
}
