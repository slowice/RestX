import { parseDocument, stringify } from 'yaml'
import {
  MAX_SKILL_DESCRIPTION_CHARS,
  MAX_SKILL_FILE_BYTES,
  MAX_SKILL_NAME_CHARS,
  MAX_SKILL_PROMPT_CHARS,
  SKILL_SCHEMA_VERSION,
  type FrequentSkill,
  type FrequentSkillDraft
} from '../../shared/contracts'
import { FrequentSkillsError } from './frequent-skills-error'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const SKILL_FIELDS = ['schemaVersion', 'id', 'name', 'description', 'createdAt', 'updatedAt'].sort()
export const SKILL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function invalidFile(): never {
  throw new FrequentSkillsError('INVALID_SKILL_FILE', 'Skill 文件格式无效。')
}

function isExactIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString() === value
}

function validateText(value: unknown, maximum: number, required: boolean): string {
  if (typeof value !== 'string') throw new FrequentSkillsError('INVALID_INPUT', 'Skill 字段类型无效。')
  const normalized = value.trim()
  if ((required && !normalized) || normalized.length > maximum) {
    throw new FrequentSkillsError('INVALID_INPUT', 'Skill 字段内容无效。')
  }
  return normalized
}

export function normalizeSkillDraft(input: FrequentSkillDraft): FrequentSkillDraft {
  return {
    name: validateText(input.name, MAX_SKILL_NAME_CHARS, true),
    description: validateText(input.description, MAX_SKILL_DESCRIPTION_CHARS, false),
    prompt: validateText(input.prompt, MAX_SKILL_PROMPT_CHARS, true)
  }
}

export function assertSkillId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 80 || !SKILL_ID_PATTERN.test(value)) {
    throw new FrequentSkillsError('INVALID_INPUT', 'Skill 标识无效。')
  }
}

export function parseSkillMarkdown(content: string): FrequentSkill {
  if (Buffer.byteLength(content, 'utf8') > MAX_SKILL_FILE_BYTES) invalidFile()
  const match = content.match(FRONTMATTER)
  if (!match) invalidFile()
  const document = parseDocument(match[1], { uniqueKeys: true })
  if (document.errors.length > 0) invalidFile()
  const value = document.toJS() as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidFile()
  const record = value as Record<string, unknown>
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(SKILL_FIELDS)) invalidFile()
  if (record.schemaVersion !== SKILL_SCHEMA_VERSION) invalidFile()
  if (typeof record.id !== 'string' || !SKILL_ID_PATTERN.test(record.id) || record.id.length > 80) invalidFile()
  if (!isExactIsoTimestamp(record.createdAt) || !isExactIsoTimestamp(record.updatedAt)) invalidFile()
  if (record.updatedAt < record.createdAt) invalidFile()

  try {
    const draft = normalizeSkillDraft({
      name: record.name as string,
      description: record.description as string,
      prompt: content.slice(match[0].length).replace(/^\r?\n/, '')
    })
    return {
      schemaVersion: SKILL_SCHEMA_VERSION,
      id: record.id,
      ...draft,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }
  } catch {
    invalidFile()
  }
}

export function serializeSkillMarkdown(skill: FrequentSkill): string {
  assertSkillId(skill.id)
  const draft = normalizeSkillDraft(skill)
  if (!isExactIsoTimestamp(skill.createdAt) || !isExactIsoTimestamp(skill.updatedAt) || skill.updatedAt < skill.createdAt) {
    throw new FrequentSkillsError('INVALID_INPUT', 'Skill 时间字段无效。')
  }
  const frontmatter = stringify({
    schemaVersion: SKILL_SCHEMA_VERSION,
    id: skill.id,
    name: draft.name,
    description: draft.description,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt
  }).trimEnd()
  const serialized = `---\n${frontmatter}\n---\n\n${draft.prompt}\n`
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SKILL_FILE_BYTES) {
    throw new FrequentSkillsError('INVALID_INPUT', 'Skill 文件内容过大。')
  }
  return serialized
}
