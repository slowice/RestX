import { createHash } from 'node:crypto'
import path from 'node:path'
import { parseDocument, type Document, type ParsedNode } from 'yaml'
import type { KnowledgeLabels, KnowledgeProblemSummary } from '../../shared/contracts'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export type ParsedKnowledgeMarkdown = {
  summary: KnowledgeProblemSummary
  original: string
  body: string
  frontmatter: Document.Parsed<ParsedNode> | null
}

type ParseMetadata = {
  sizeBytes?: number
  modifiedAt?: Date
}

function fingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function titleFromBody(body: string, id: string): string {
  const heading = body.match(/^\s*#\s+(.+?)\s*$/m)?.[1]?.trim()
  if (heading) return heading.slice(0, 160)
  return path.basename(id).replace(/\.(?:md|markdown)$/i, '').slice(0, 160) || '未命名问题'
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text : null
}

function normalizedList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const values = value.map(normalizedText)
  if (values.some((item) => item === null)) return null
  return [...new Set(values as string[])]
}

function validateLabels(document: Document.Parsed<ParsedNode>): {
  labels?: KnowledgeLabels
  status: KnowledgeProblemSummary['status']
  issue?: string
} {
  const value = document.toJS()
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const type = record.type
  const sceneValue = record.scene
  const capabilityValue = record.capability
  const knowledgeValue = record.knowledge
  const hasManagedField = [type, sceneValue, capabilityValue, knowledgeValue].some((value) => value !== undefined)
  if (!hasManagedField) return { status: 'pending' }
  if (type !== undefined && type !== 'problem') return { status: 'invalid', issue: 'Frontmatter 的 type 必须为 problem。' }

  const scene = normalizedText(sceneValue)
  const capabilities = normalizedList(capabilityValue)
  const knowledge = normalizedList(knowledgeValue)
  const hasInvalidType = (sceneValue !== undefined && !scene)
    || (capabilityValue !== undefined && capabilities === null)
    || (knowledgeValue !== undefined && knowledge === null)
  if (hasInvalidType) return { status: 'invalid', issue: 'Frontmatter 的场景、能力或知识字段类型无效。' }
  if (!scene || !capabilities?.length || !knowledge?.length || type !== 'problem') return { status: 'pending' }
  return { status: 'organized', labels: { scene, capabilities, knowledge } }
}

export function parseKnowledgeMarkdown(
  content: string,
  id: string,
  metadata: ParseMetadata = {}
): ParsedKnowledgeMarkdown {
  const match = content.match(FRONTMATTER)
  const body = match ? content.slice(match[0].length) : content
  const common = {
    id,
    name: path.basename(id),
    title: titleFromBody(body, id),
    sizeBytes: metadata.sizeBytes ?? Buffer.byteLength(content, 'utf8'),
    modifiedAt: (metadata.modifiedAt ?? new Date(0)).toISOString(),
    sourceFingerprint: fingerprint(content)
  }
  if (!match) {
    return {
      original: content,
      body,
      frontmatter: null,
      summary: { ...common, status: 'pending' }
    }
  }

  const document = parseDocument(match[1])
  if (document.errors.length) {
    return {
      original: content,
      body,
      frontmatter: document,
      summary: { ...common, status: 'invalid', issue: 'Frontmatter YAML 无法解析。' }
    }
  }
  const validation = validateLabels(document)
  return {
    original: content,
    body,
    frontmatter: document,
    summary: {
      ...common,
      status: validation.status,
      ...(validation.labels ? { labels: validation.labels } : {}),
      ...(validation.issue ? { issue: validation.issue } : {})
    }
  }
}
