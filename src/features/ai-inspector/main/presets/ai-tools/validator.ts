import path from 'node:path'
import type { AiToolPreset } from './types'
import type { AiToolPathFields } from '../../../shared/contracts/ai-tool-preset'

const VALID_KINDS = new Set(['config', 'instruction', 'conversation', 'history', 'log'])
const VALID_VIEWERS = new Set(['config', 'jsonl', 'metadata'])
const VALID_TONES = new Set(['neutral', 'user', 'assistant', 'thinking', 'tool', 'result', 'system', 'error'])
const VALID_PLATFORMS = new Set<NodeJS.Platform>(['darwin', 'win32', 'linux'])
const SUPPORTED_PATH_VARIABLES = new Set(['HOME', 'TEMP', 'UID'])
const SENSITIVE_PATH = /(?:^|[._/-])(auth|credentials?|secrets?|tokens?|keychain|private[-_]?keys?|databases?|caches?)(?:[._/-]|$)/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSafeRelativePath(value: string): boolean {
  if (!value || value.length > 1_000 || value.includes('\0') || value.includes('*') || path.isAbsolute(value)) return false
  const normalized = path.normalize(value)
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`)
}

function isSensitivePath(value: string): boolean {
  return SENSITIVE_PATH.test(value.replaceAll('\\', '/'))
}

function containsFunction(value: unknown, visited = new Set<object>()): boolean {
  if (typeof value === 'function') return true
  if (!value || typeof value !== 'object' || visited.has(value)) return false
  visited.add(value)
  return Object.values(value as Record<string, unknown>).some((child) => containsFunction(child, visited))
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key))
  if (unknown) throw new Error(`${label} 包含不支持的字段：${unknown}`)
}

function assertShortString(value: unknown, label: string, max = 200): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw new Error(`${label} 无效`)
}

function assertPathFields(
  value: Record<string, unknown>,
  label: string
): asserts value is Record<string, unknown> & AiToolPathFields {
  const hasRelativePath = value.relativePath !== undefined
  const hasPath = value.path !== undefined
  if (hasRelativePath === hasPath) throw new Error(`${label} 必须且只能指定 relativePath 或 path`)

  if (hasRelativePath) {
    if (typeof value.relativePath !== 'string' || !isSafeRelativePath(value.relativePath)) throw new Error(`${label} 路径无效：${String(value.relativePath)}`)
  } else {
    if (typeof value.path !== 'string' || !value.path.trim() || value.path.length > 1_000 || value.path.includes('\0')) throw new Error(`${label} 路径无效：${String(value.path)}`)
    const variables = [...value.path.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1])
    if (variables.some((variable) => !SUPPORTED_PATH_VARIABLES.has(variable))) throw new Error(`${label} 路径包含不支持的变量`)
    const beginsWithVariable = /^\$\{(HOME|TEMP|UID)\}(?:[\\/]|$)/.test(value.path)
    const isAbsoluteLiteral = path.isAbsolute(value.path) || /^[A-Za-z]:[\\/]/.test(value.path) || value.path.startsWith('\\\\')
    if (!beginsWithVariable && !isAbsoluteLiteral) throw new Error(`${label} 路径必须以受支持变量或绝对路径开头`)
    const segments = value.path.split(/[\\/]+/)
    if (segments.includes('..') || value.path.includes('**') || segments.slice(0, -1).some((segment) => segment.includes('*'))) throw new Error(`${label} 路径无效：${value.path}`)
  }

  if (value.platforms !== undefined) {
    if (!Array.isArray(value.platforms) || value.platforms.length === 0 || value.platforms.length > VALID_PLATFORMS.size || new Set(value.platforms).size !== value.platforms.length || value.platforms.some((platform) => typeof platform !== 'string' || !VALID_PLATFORMS.has(platform as NodeJS.Platform))) {
      throw new Error(`${label} 平台无效`)
    }
  }
}

export function validateAiToolPresets(presets: readonly AiToolPreset[]): void {
  if (!Array.isArray(presets) || presets.length > 100) throw new Error('AI 工具预置列表无效')
  const ids = new Set<string>()
  const profileIds = new Set<string>()
  for (const preset of presets) {
    if (!isRecord(preset)) throw new Error('AI 工具预置格式无效')
    if (containsFunction(preset)) throw new Error(`AI 工具预置只能包含声明式数据：${String(preset.id)}`)
    assertKeys(preset, ['id', 'displayName', 'version', 'probes', 'sources', 'jsonlProfiles'], 'AI 工具预置')
    assertShortString(preset.id, 'AI 工具预置 id', 100)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(preset.id)) throw new Error(`AI 工具预置 id 无效：${preset.id}`)
    if (ids.has(preset.id)) throw new Error(`AI 工具预置 id 重复：${preset.id}`)
    ids.add(preset.id)
    assertShortString(preset.displayName, `AI 工具预置名称 ${preset.id}`)
    if (preset.version !== 1) throw new Error(`AI 工具预置版本无效：${preset.id}`)
    if (!Array.isArray(preset.probes) || preset.probes.length === 0 || preset.probes.length > 12) throw new Error(`AI 工具预置探针无效：${preset.id}`)
    if (!Array.isArray(preset.sources) || preset.sources.length === 0 || preset.sources.length > 12) throw new Error(`AI 工具预置来源无效：${preset.id}`)

    const localProfileIds = new Set<string>()
    const profiles = preset.jsonlProfiles ?? []
    if (!Array.isArray(profiles) || profiles.length > 8) throw new Error(`JSONL profile 列表无效：${preset.id}`)
    for (const profile of profiles) {
      if (!isRecord(profile)) throw new Error(`JSONL profile 格式无效：${preset.id}`)
      assertKeys(profile, ['id', 'fileExtensions', 'timestampPaths', 'sessionPaths', 'workspacePaths', 'summaryPaths', 'tagRules'], 'JSONL profile')
      assertShortString(profile.id, 'JSONL profile id', 100)
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.id) || profileIds.has(profile.id)) throw new Error(`JSONL profile id 无效或重复：${profile.id}`)
      profileIds.add(profile.id)
      localProfileIds.add(profile.id)
      if (profile.fileExtensions !== undefined) {
        if (
          !Array.isArray(profile.fileExtensions) ||
          profile.fileExtensions.length === 0 ||
          profile.fileExtensions.length > 8 ||
          new Set(profile.fileExtensions).size !== profile.fileExtensions.length ||
          profile.fileExtensions.some((extension) => typeof extension !== 'string' || !/^\.[a-z0-9][a-z0-9_-]{0,15}$/.test(extension))
        ) {
          throw new Error(`JSONL 文件扩展名无效：${profile.id}`)
        }
      }
      if (!Array.isArray(profile.timestampPaths) || profile.timestampPaths.length > 12) throw new Error(`JSONL 时间路径无效：${profile.id}`)
      for (const [label, paths] of [
        ['会话', profile.sessionPaths], ['工作区', profile.workspacePaths], ['摘要', profile.summaryPaths]
      ] as const) {
        if (paths !== undefined && (!Array.isArray(paths) || paths.length > 20)) throw new Error(`JSONL ${label}路径无效：${profile.id}`)
      }
      if (!Array.isArray(profile.tagRules) || profile.tagRules.length === 0 || profile.tagRules.length > 30) throw new Error(`JSONL profile 没有有效标签规则：${profile.id}`)
      for (const rule of profile.tagRules) {
        if (!isRecord(rule)) throw new Error(`JSONL 标签规则无效：${profile.id}`)
        assertKeys(rule, ['path', 'values', 'fallback'], 'JSONL 标签规则')
        assertShortString(rule.path, 'JSONL 标签路径', 300)
        if (rule.fallback !== undefined && rule.fallback !== 'raw-value' && rule.fallback !== 'ignore') throw new Error(`JSONL fallback 无效：${profile.id}`)
        if (rule.values !== undefined) {
          if (!isRecord(rule.values) || Object.keys(rule.values).length > 100) throw new Error(`JSONL 标签映射无效：${profile.id}`)
          for (const tag of Object.values(rule.values)) {
            if (!isRecord(tag)) throw new Error(`JSONL 标签无效：${profile.id}`)
            assertKeys(tag, ['label', 'tone'], 'JSONL 标签')
            assertShortString(tag.label, 'JSONL 标签名称', 80)
            if (!VALID_TONES.has(String(tag.tone))) throw new Error(`JSONL 标签色调无效：${profile.id}`)
          }
        }
      }
      for (const valuePath of [
        ...profile.timestampPaths,
        ...(Array.isArray(profile.sessionPaths) ? profile.sessionPaths : []),
        ...(Array.isArray(profile.workspacePaths) ? profile.workspacePaths : []),
        ...(Array.isArray(profile.summaryPaths) ? profile.summaryPaths : []),
        ...profile.tagRules.map((rule) => rule.path)
      ]) {
        if (typeof valuePath !== 'string' || !/^[A-Za-z0-9_-]+(?:\[\*\])?(?:\.[A-Za-z0-9_-]+(?:\[\*\])?)*$/.test(valuePath)) {
          throw new Error(`JSONL profile 路径无效：${profile.id}/${String(valuePath)}`)
        }
      }
    }

    const sourceIds = new Set<string>()
    for (const probe of preset.probes) {
      if (!isRecord(probe)) throw new Error(`AI 工具探针无效：${preset.id}`)
      assertKeys(probe, ['relativePath', 'path', 'platforms', 'entryType'], 'AI 工具探针')
      assertPathFields(probe, 'AI 工具探针')
      const probePath = probe.relativePath ?? probe.path
      if (typeof probePath !== 'string') throw new Error(`AI 工具探针路径无效：${preset.id}`)
      if (isSensitivePath(probePath)) throw new Error(`AI 工具探针不能指向敏感路径：${probePath}`)
      if (probe.entryType !== 'file' && probe.entryType !== 'directory') throw new Error(`AI 工具探针类型无效：${preset.id}`)
    }
    let ruleCount = 0
    for (const source of preset.sources) {
      if (!isRecord(source)) throw new Error(`AI 工具来源无效：${preset.id}`)
      assertKeys(source, ['id', 'relativePath', 'path', 'platforms', 'label', 'patterns', 'excludes', 'maxDepth'], 'AI 工具来源')
      assertShortString(source.id, 'AI 工具来源 id', 100)
      if (sourceIds.has(source.id)) throw new Error(`AI 工具来源 id 重复：${preset.id}/${source.id}`)
      sourceIds.add(source.id)
      assertShortString(source.label, 'AI 工具来源名称')
      assertPathFields(source, 'AI 工具来源')
      const sourcePath = source.relativePath ?? source.path
      if (typeof sourcePath !== 'string') throw new Error(`AI 工具来源路径无效：${preset.id}/${source.id}`)
      if (typeof source.maxDepth !== 'number' || !Number.isInteger(source.maxDepth) || source.maxDepth < 0 || source.maxDepth > 12) throw new Error(`AI 工具来源无效：${preset.id}/${source.id}`)
      if (isSensitivePath(sourcePath)) throw new Error(`AI 工具来源不能指向敏感路径：${preset.id}/${source.id}`)
      if (!Array.isArray(source.patterns) || source.patterns.length === 0) throw new Error(`AI 工具来源没有匹配规则：${preset.id}/${source.id}`)
      ruleCount += source.patterns.length
      if (ruleCount > 80) throw new Error(`AI 工具匹配规则过多：${preset.id}`)
      for (const rule of source.patterns) {
        if (!isRecord(rule)) throw new Error(`AI 工具匹配规则无效：${preset.id}/${source.id}`)
        assertKeys(rule, ['glob', 'kind', 'viewer', 'label', 'jsonlProfileId'], 'AI 工具匹配规则')
        assertShortString(rule.glob, 'AI 工具 glob', 300)
        assertShortString(rule.label, 'AI 工具匹配标签')
        if (rule.glob.includes('..') || path.isAbsolute(rule.glob) || rule.glob === '**/*') throw new Error(`AI 工具 glob 无效：${preset.id}/${source.id}`)
        if (SENSITIVE_PATH.test(rule.glob)) throw new Error(`AI 工具 glob 不能匹配敏感文件：${preset.id}/${source.id}`)
        if (!VALID_KINDS.has(String(rule.kind)) || !VALID_VIEWERS.has(String(rule.viewer))) throw new Error(`AI 工具查看器或类型无效：${preset.id}/${source.id}`)
        if (rule.viewer === 'jsonl' && (typeof rule.jsonlProfileId !== 'string' || !localProfileIds.has(rule.jsonlProfileId))) throw new Error(`AI 工具 JSONL profile 缺失：${preset.id}/${source.id}`)
      }
      if (source.excludes !== undefined && (!Array.isArray(source.excludes) || source.excludes.length > 80)) throw new Error(`AI 工具排除规则无效：${preset.id}/${source.id}`)
      for (const exclude of source.excludes ?? []) {
        if (typeof exclude !== 'string' || !exclude || exclude.length > 300 || exclude.includes('..') || path.isAbsolute(exclude)) throw new Error(`AI 工具排除规则无效：${preset.id}/${source.id}`)
      }
    }
  }
}

export function assertAiToolPresetUsesRelativePaths(preset: AiToolPreset): void {
  for (const declaration of [...preset.probes, ...preset.sources]) {
    if (typeof declaration.path === 'string') throw new Error('用户预置仅支持相对路径声明。')
  }
}

export function parseAiToolPreset(value: unknown): AiToolPreset {
  validateAiToolPresets([value as AiToolPreset])
  return value as AiToolPreset
}
