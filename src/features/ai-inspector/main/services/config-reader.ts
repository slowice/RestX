import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'
import type { ConfigDocument, ConfigFormat, ConfigValue } from '../../shared/contracts/config'

const DEFAULT_MAX_BYTES = 512 * 1024
const REDACTED = '[REDACTED]'
const SENSITIVE_KEY = /(?:^|[_\-.])(api[_-]?key|secret|token|password|passwd|authorization|private[_-]?key|access[_-]?key|client[_-]?secret)(?:$|[_\-.])/i

export class ConfigReadError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ConfigReadError'
  }
}

type ParsedConfig = {
  format: ConfigFormat
  redactedText: string
  data: ConfigValue | null
  parseError: string | null
  redactionCount: number
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
  return SENSITIVE_KEY.test(normalized)
}

function normalizeValue(value: unknown): ConfigValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, normalizeValue(child)]))
  }
  return String(value)
}

export function redactConfigValue(value: ConfigValue): { value: ConfigValue; count: number } {
  let count = 0

  function visit(current: ConfigValue): ConfigValue {
    if (Array.isArray(current)) return current.map(visit)
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(Object.entries(current).map(([key, child]) => {
        if (isSensitiveKey(key)) {
          count += 1
          return [key, REDACTED]
        }
        return [key, visit(child)]
      }))
    }
    return current
  }

  return { value: visit(value), count }
}

function redactText(input: string): { text: string; count: number } {
  let count = 0
  let text = input.replace(/(^|[\n,{])(\s*["']?([A-Za-z0-9_.-]+)["']?\s*:\s*)(["'][^"'\n]*["']|[^,}\n]+)/g, (match, boundary: string, prefix: string, key: string) => {
    if (!isSensitiveKey(key)) return match
    count += 1
    return `${boundary}${prefix}"${REDACTED}"`
  })
  text = text.replace(/(^|\n)(\s*["']?([A-Za-z0-9_.-]+)["']?\s*=\s*)([^\n]+)/g, (match, lineStart: string, prefix: string, key: string) => {
    if (!isSensitiveKey(key)) return match
    count += 1
    return `${lineStart}${prefix}"${REDACTED}"`
  })
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, () => {
    count += 1
    return `Bearer ${REDACTED}`
  })
  text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, () => {
    count += 1
    return REDACTED
  })
  return { text, count }
}

function parseIni(input: string): ConfigValue {
  const root: Record<string, ConfigValue> = {}
  let target = root
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    const section = line.match(/^\[([^\]]+)]$/)
    if (section) {
      const name = section[1].trim()
      const sectionValue: Record<string, ConfigValue> = {}
      root[name] = sectionValue
      target = sectionValue
      continue
    }
    const separator = line.indexOf('=')
    if (separator < 1) throw new Error(`无效的 INI 行：${rawLine}`)
    target[line.slice(0, separator).trim()] = unquote(line.slice(separator + 1).trim())
  }
  return root
}

function parseEnv(input: string): ConfigValue {
  const result: Record<string, ConfigValue> = {}
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line
    const separator = normalized.indexOf('=')
    if (separator < 1) throw new Error(`无效的 .env 行：${rawLine}`)
    result[normalized.slice(0, separator).trim()] = unquote(normalized.slice(separator + 1).trim())
  }
  return result
}

function unquote(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1)
  }
  return value
}

function getFormat(fileName: string): ConfigFormat {
  const lower = fileName.toLowerCase()
  if (lower === '.env' || lower.endsWith('.env')) return 'env'
  const extension = path.extname(lower)
  if (extension === '.json') return 'json'
  if (extension === '.yaml' || extension === '.yml') return 'yaml'
  if (extension === '.toml') return 'toml'
  if (extension === '.ini') return 'ini'
  return 'text'
}

export function parseConfigText(fileName: string, input: string): ParsedConfig {
  const format = getFormat(fileName)
  const textRedaction = redactText(input)
  if (format === 'text') return { format, redactedText: textRedaction.text, data: null, parseError: null, redactionCount: textRedaction.count }

  try {
    const parsed = format === 'json'
      ? JSON.parse(input)
      : format === 'yaml'
        ? parseYaml(input)
        : format === 'toml'
          ? parseToml(input)
          : format === 'ini'
            ? parseIni(input)
            : parseEnv(input)
    const normalized = normalizeValue(parsed)
    const structuredRedaction = redactConfigValue(normalized)
    return {
      format,
      redactedText: format === 'json' ? JSON.stringify(structuredRedaction.value, null, 2) : textRedaction.text,
      data: structuredRedaction.value,
      parseError: null,
      redactionCount: Math.max(textRedaction.count, structuredRedaction.count)
    }
  } catch (error) {
    const formatLabel = format.toUpperCase()
    const detail = error instanceof Error ? error.message.split('\n')[0] : '未知语法错误'
    return {
      format,
      redactedText: textRedaction.text,
      data: null,
      parseError: `${formatLabel} 解析失败：${detail}`,
      redactionCount: textRedaction.count
    }
  }
}

export async function readConfigDocument(filePath: string, options: { maxBytes?: number } = {}): Promise<ConfigDocument> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  let stat
  try {
    stat = await lstat(filePath)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new ConfigReadError('配置文件不存在或已被移动。', 'NOT_FOUND')
    if (code === 'EACCES' || code === 'EPERM') throw new ConfigReadError('没有权限读取该配置文件。', 'PERMISSION_DENIED')
    throw new ConfigReadError('无法读取该配置文件。', 'UNAVAILABLE')
  }
  if (stat.isSymbolicLink()) throw new ConfigReadError('为避免越过授权目录，不能读取符号链接。', 'SYMLINK_NOT_ALLOWED')
  if (!stat.isFile()) throw new ConfigReadError('所选路径不是普通文件。', 'NOT_FILE')
  if (stat.size > maxBytes) throw new ConfigReadError(`配置文件超过 ${Math.round(maxBytes / 1024)} KiB 查看上限。`, 'FILE_TOO_LARGE')

  const buffer = await readFile(filePath)
  if (buffer.length > maxBytes) throw new ConfigReadError(`配置文件超过 ${Math.round(maxBytes / 1024)} KiB 查看上限。`, 'FILE_TOO_LARGE')
  if (buffer.includes(0)) throw new ConfigReadError('该文件不是可显示的 UTF-8 文本配置。', 'BINARY_FILE')

  const parsed = parseConfigText(path.basename(filePath), buffer.toString('utf8'))
  return {
    path: path.resolve(filePath),
    name: path.basename(filePath),
    sizeBytes: buffer.length,
    modifiedAt: stat.mtime.toISOString(),
    sourceHash: createHash('sha256').update(buffer).digest('hex'),
    ...parsed
  }
}
