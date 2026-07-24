import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Document } from 'yaml'
import type { ApplyKnowledgeClassificationInput } from '../../shared/contracts'
import { parseKnowledgeMarkdown, type ParsedKnowledgeMarkdown } from './markdown-parser'

export class KnowledgeWriteError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'KnowledgeWriteError'
  }
}

function resolveProblemPath(root: string, problemId: string): string {
  if (!problemId || path.isAbsolute(problemId) || !/\.(?:md|markdown)$/i.test(problemId)) {
    throw new KnowledgeWriteError('问题标识无效。', 'INVALID_PROBLEM_ID')
  }
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, ...problemId.split('/'))
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new KnowledgeWriteError('问题标识超出知识目录。', 'INVALID_PROBLEM_ID')
  }
  return target
}

function validateConfirmedLabel(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new KnowledgeWriteError(`${field}无效。`, 'INVALID_CLASSIFICATION')
  const normalized = value.trim()
  if (!normalized || normalized.length > 80 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new KnowledgeWriteError(`${field}无效。`, 'INVALID_CLASSIFICATION')
  }
  return normalized
}

function validateConfirmedList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new KnowledgeWriteError(`${field}数量无效。`, 'INVALID_CLASSIFICATION')
  }
  return [...new Map(value.map((item) => {
    const label = validateConfirmedLabel(item, field)
    return [label.toLocaleLowerCase(), label]
  })).values()]
}

function timestampName(value: Date): string {
  return value.toISOString().replace(/[:.]/g, '-')
}

export async function applyKnowledgeClassification({
  root,
  input,
  now = () => new Date()
}: {
  root: string
  input: ApplyKnowledgeClassificationInput
  now?: () => Date
}): Promise<ParsedKnowledgeMarkdown> {
  const target = resolveProblemPath(root, input.problemId)
  const scene = validateConfirmedLabel(input.scene, '场景')
  const capabilities = validateConfirmedList(input.capabilities, '能力')
  const knowledge = validateConfirmedList(input.knowledge, '知识')
  let original: string
  try {
    original = await readFile(target, 'utf8')
  } catch {
    throw new KnowledgeWriteError('问题文件已不存在或无法读取。', 'SOURCE_UNAVAILABLE')
  }
  const parsed = parseKnowledgeMarkdown(original, input.problemId)
  if (parsed.summary.sourceFingerprint !== input.sourceFingerprint) {
    throw new KnowledgeWriteError('问题文件已发生变化，请重新整理。', 'SOURCE_CONFLICT')
  }
  if (parsed.summary.status === 'invalid') {
    throw new KnowledgeWriteError('Frontmatter 无法安全更新，请先在编辑器中修复。', 'INVALID_FRONTMATTER')
  }

  const document = parsed.frontmatter ?? new Document({})
  document.set('type', 'problem')
  document.set('scene', scene)
  document.set('capability', capabilities)
  document.set('knowledge', knowledge)
  const yaml = document.toString({ lineWidth: 0 }).replace(/\s+$/, '')
  const updated = `---\n${yaml}\n---\n${parsed.body}`
  const backupRoot = path.join(path.resolve(root), '.restx-backup')
  await mkdir(backupRoot, { recursive: true, mode: 0o700 })
  const safeId = input.problemId.replace(/[\\/]+/g, '__')
  const backupPath = path.join(backupRoot, `${safeId}.${timestampName(now())}.bak.md`)
  const temporaryPath = `${target}.restx-${process.pid}-${Date.now()}.tmp`
  try {
    await copyFile(target, backupPath)
    await writeFile(temporaryPath, updated, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporaryPath, target)
  } catch {
    await unlink(temporaryPath).catch(() => undefined)
    throw new KnowledgeWriteError('无法安全写入问题文件。', 'WRITE_FAILED')
  }
  return parseKnowledgeMarkdown(updated, input.problemId)
}

