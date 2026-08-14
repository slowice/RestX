import path from 'node:path'
import { parseDocument } from 'yaml'
import {
  MAX_SKILL_DESCRIPTION_CHARS,
  MAX_SKILL_FILE_BYTES,
  MAX_SKILL_NAME_CHARS,
  MAX_SKILL_PROMPT_CHARS,
  type FrequentSkillDraft
} from '../../shared/contracts'
import { FrequentSkillsError } from './frequent-skills-error'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const CONTROL_BYTE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g

function invalidFile(message = 'Skill 文件不是可安全导入的 Markdown 文本。'): never {
  throw new FrequentSkillsError('INVALID_SKILL_FILE', message)
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized && normalized.length <= maximum ? normalized : undefined
}

export function normalizeImportedPrompt(source: string): string {
  const normalized = source
    .replace(/\r\n/g, '\n')
    .replace(/^(?:[\t ]*\n)+/, '')
    .replace(/(?:\n[\t ]*)+$/, '')
  if (!normalized.trim() || normalized.length > MAX_SKILL_PROMPT_CHARS) invalidFile()
  return normalized
}

export function readMarkdownSource(buffer: Buffer, selectedPath: string): string {
  if (path.extname(selectedPath).toLowerCase() !== '.md') {
    invalidFile('请选择 Markdown（.md）Skill 文件。')
  }
  if (buffer.length === 0 || buffer.length > MAX_SKILL_FILE_BYTES) invalidFile()
  let source: string
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    invalidFile()
  }
  const controls = source.match(CONTROL_BYTE)?.length ?? 0
  if (source.includes('\0') || controls > Math.max(2, Math.floor(source.length * 0.01))) invalidFile()
  return source
}

export function extractFallbackDraft(source: string, selectedPath: string): FrequentSkillDraft {
  let metadata: Record<string, unknown> = {}
  const frontmatter = source.match(FRONTMATTER)
  if (frontmatter) {
    try {
      const document = parseDocument(frontmatter[1], { uniqueKeys: true })
      const value = document.errors.length === 0 ? document.toJS() : undefined
      if (value && typeof value === 'object' && !Array.isArray(value)) metadata = value as Record<string, unknown>
    } catch {
      // Invalid optional metadata does not make otherwise safe Markdown unimportable.
    }
  }
  const heading = source.match(/^#\s+(.+?)\s*$/m)?.[1]
  const filename = path.basename(selectedPath, path.extname(selectedPath)).trim()
  const name = boundedText(metadata.name, MAX_SKILL_NAME_CHARS)
    ?? boundedText(metadata.title, MAX_SKILL_NAME_CHARS)
    ?? boundedText(heading, MAX_SKILL_NAME_CHARS)
    ?? boundedText(filename, MAX_SKILL_NAME_CHARS)
    ?? 'Imported Skill'
  const description = boundedText(metadata.description, MAX_SKILL_DESCRIPTION_CHARS)
    ?? boundedText(metadata.summary, MAX_SKILL_DESCRIPTION_CHARS)
    ?? ''
  return { name, description, prompt: normalizeImportedPrompt(source) }
}
