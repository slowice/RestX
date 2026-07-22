import { parse as parseYaml } from 'yaml'
import type { ReviewCategory, ReviewZone } from '../../shared/contracts/code-review'
import javaRules from '../presets/review-rules/java-mybatis-sql/RULES.md?raw'
import loggingRules from '../presets/review-rules/logging/RULES.md?raw'
import securityRules from '../presets/review-rules/security-baseline/RULES.md?raw'
import typescriptRules from '../presets/review-rules/typescript-quality/RULES.md?raw'

const MAX_RULE_CHARACTERS = 30_000
const CATEGORIES: ReviewCategory[] = ['security', 'bug', 'logging', 'consistency', 'test', 'maintainability']

export type ReviewRulePack = {
  id: string
  name: string
  version: string
  zones: ReviewZone[]
  languages: string[]
  categories: ReviewCategory[]
  mandatory: boolean
  instructions: string
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`规则包 ${field} 必须是非空字符串数组。`)
  }
  return value.map((item) => String(item).trim().toLowerCase())
}

export function parseReviewRulePack(markdown: string): ReviewRulePack {
  if (typeof markdown !== 'string' || markdown.length > MAX_RULE_CHARACTERS) throw new Error('规则包为空或超过大小限制。')
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/.exec(markdown.trim())
  if (!match) throw new Error('规则包缺少 YAML frontmatter。')
  const metadata = parseYaml(match[1]) as Record<string, unknown>
  if (!metadata || typeof metadata !== 'object') throw new Error('规则包元数据无效。')
  const id = typeof metadata.id === 'string' ? metadata.id.trim() : ''
  const name = typeof metadata.name === 'string' ? metadata.name.trim() : ''
  const version = typeof metadata.version === 'string' ? metadata.version.trim() : ''
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !name || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('规则包 id、name 或 version 无效。')
  const zones = stringArray(metadata.zones, 'zones')
  if (zones.some((zone) => zone !== 'blue' && zone !== 'yellow')) throw new Error('规则包包含未知网络区域。')
  const categories = stringArray(metadata.categories, 'categories')
  if (categories.some((category) => !CATEGORIES.includes(category as ReviewCategory))) throw new Error('规则包包含未知检视分类。')
  const instructions = match[2].trim()
  if (!instructions) throw new Error('规则包缺少 Markdown 指令正文。')
  return {
    id, name, version,
    zones: zones as ReviewZone[],
    languages: stringArray(metadata.languages, 'languages'),
    categories: categories as ReviewCategory[],
    mandatory: metadata.mandatory === true,
    instructions
  }
}

const BUILTIN_RULES = [securityRules, javaRules, loggingRules, typescriptRules].map(parseReviewRulePack)

const EXTENSION_LANGUAGE: Record<string, string> = {
  java: 'java', xml: 'xml', sql: 'sql', ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx'
}

export function selectReviewRulePacks(zone: ReviewZone, filePaths: string[]): ReviewRulePack[] {
  const languages = new Set(filePaths.map((path) => EXTENSION_LANGUAGE[path.split('.').pop()?.toLowerCase() ?? '']).filter(Boolean))
  return BUILTIN_RULES.filter((pack) => pack.zones.includes(zone) && (pack.mandatory || pack.languages.includes('*') || pack.languages.some((language) => languages.has(language))))
}
