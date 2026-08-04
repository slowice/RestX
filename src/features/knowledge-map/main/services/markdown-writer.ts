import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Document } from 'yaml'
import type {
  ApplyKnowledgeClassificationInput,
  ApplyKnowledgeEditsInput,
  KnowledgeEditableClassification,
  KnowledgeProblemEdit
} from '../../shared/contracts'
import { MAX_KNOWLEDGE_EDIT_BATCH } from '../../shared/contracts'
import {
  KnowledgeFileAccessError,
  readSafeKnowledgeFile
} from './knowledge-file-access'
import { parseKnowledgeMarkdown, type ParsedKnowledgeMarkdown } from './markdown-parser'

export class KnowledgeWriteError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'KnowledgeWriteError'
  }
}

type BatchWriteDependencies = {
  renameFile?: typeof rename
}

type PreparedEdit = {
  edit: KnowledgeProblemEdit
  target: string
  original: string
  updated: string
  originalFingerprint: string
  backupPath: string
  temporaryPath: string
  rollbackPath: string
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

function validateLabel(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new KnowledgeWriteError(`${field}无效。`, 'INVALID_CLASSIFICATION')
  const normalized = value.trim()
  if (!normalized || normalized.length > 80 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new KnowledgeWriteError(`${field}无效。`, 'INVALID_CLASSIFICATION')
  }
  return normalized
}

function validateList(value: unknown, field: string, requireValue: boolean): string[] {
  if (!Array.isArray(value) || value.length > 8 || (requireValue && value.length < 1)) {
    throw new KnowledgeWriteError(`${field}数量无效。`, 'INVALID_CLASSIFICATION')
  }
  return [...new Map(value.map((item) => {
    const label = validateLabel(item, field)
    return [label.toLocaleLowerCase(), label]
  })).values()]
}

function validateClassification(
  value: KnowledgeEditableClassification | null
): KnowledgeEditableClassification | null {
  if (value === null) return null
  if (!value || typeof value !== 'object') {
    throw new KnowledgeWriteError('问题分类无效。', 'INVALID_CLASSIFICATION')
  }
  return {
    scene: value.scene === null ? null : validateLabel(value.scene, '场景'),
    capabilities: validateList(value.capabilities, '能力', false),
    knowledge: validateList(value.knowledge, '知识', false)
  }
}

function validateEdit(edit: KnowledgeProblemEdit): KnowledgeProblemEdit {
  if (typeof edit.problemId !== 'string' || !edit.problemId || edit.problemId.length > 2_000
    || edit.problemId.includes('\0') || path.isAbsolute(edit.problemId) || !/\.(?:md|markdown)$/i.test(edit.problemId)) {
    throw new KnowledgeWriteError('问题标识无效。', 'INVALID_PROBLEM_ID')
  }
  if (typeof edit.sourceFingerprint !== 'string' || !edit.sourceFingerprint || edit.sourceFingerprint.length > 128
    || /[\u0000-\u001f\u007f]/.test(edit.sourceFingerprint)) {
    throw new KnowledgeWriteError('问题版本标识无效。', 'INVALID_SOURCE_FINGERPRINT')
  }
  return { ...edit, classification: validateClassification(edit.classification) }
}

function timestampName(value: Date): string {
  return value.toISOString().replace(/[:.]/g, '-')
}

function renderClassification(
  parsed: ParsedKnowledgeMarkdown,
  classification: KnowledgeEditableClassification | null
): string {
  const document = parsed.frontmatter ?? new Document({})
  if (classification === null) {
    document.delete('type')
    document.delete('scene')
    document.delete('capability')
    document.delete('knowledge')
  } else {
    document.set('type', 'problem')
    if (classification.scene) document.set('scene', classification.scene)
    else document.delete('scene')
    if (classification.capabilities.length) document.set('capability', classification.capabilities)
    else document.delete('capability')
    if (classification.knowledge.length) document.set('knowledge', classification.knowledge)
    else document.delete('knowledge')
  }
  const value = document.toJS()
  const hasFields = Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length)
  if (!hasFields) return parsed.body
  const yaml = document.toString({ lineWidth: 0 }).replace(/\s+$/, '')
  return `---\n${yaml}\n---\n${parsed.body}`
}

async function readOriginal(root: string, target: string): Promise<string> {
  try {
    return (await readSafeKnowledgeFile(root, target)).content
  } catch (error) {
    if (error instanceof KnowledgeFileAccessError && error.code === 'SOURCE_TOO_LARGE') {
      throw new KnowledgeWriteError(error.message, error.code)
    }
    throw new KnowledgeWriteError('问题文件已不存在或无法读取。', 'SOURCE_UNAVAILABLE')
  }
}

export async function applyKnowledgeEdits({
  root,
  input,
  now = () => new Date(),
  dependencies = {}
}: {
  root: string
  input: ApplyKnowledgeEditsInput
  now?: () => Date
  dependencies?: BatchWriteDependencies
}): Promise<ParsedKnowledgeMarkdown[]> {
  if (!Array.isArray(input.edits) || input.edits.length < 1 || input.edits.length > MAX_KNOWLEDGE_EDIT_BATCH) {
    throw new KnowledgeWriteError('批量编辑数量无效。', 'INVALID_BATCH')
  }
  const validated = input.edits.map(validateEdit)
  if (new Set(validated.map((edit) => edit.problemId)).size !== validated.length) {
    throw new KnowledgeWriteError('批量编辑包含重复问题。', 'DUPLICATE_PROBLEM')
  }

  const resolvedRoot = path.resolve(root)
  const backupRoot = path.join(resolvedRoot, '.restx-backup')
  const batchId = `${timestampName(now())}-${process.pid}-${Date.now()}`
  const prepared: PreparedEdit[] = []
  for (const edit of validated) {
    const target = resolveProblemPath(resolvedRoot, edit.problemId)
    const original = await readOriginal(resolvedRoot, target)
    const parsed = parseKnowledgeMarkdown(original, edit.problemId)
    if (parsed.summary.sourceFingerprint !== edit.sourceFingerprint) {
      throw new KnowledgeWriteError('部分问题文件已发生变化，请刷新后重新编辑。', 'SOURCE_CONFLICT')
    }
    if (parsed.summary.status === 'invalid') {
      throw new KnowledgeWriteError('Frontmatter 无法安全更新，请先在编辑器中修复。', 'INVALID_FRONTMATTER')
    }
    const safeId = edit.problemId.replace(/[\\/]+/g, '__')
    prepared.push({
      edit,
      target,
      original,
      updated: renderClassification(parsed, edit.classification),
      originalFingerprint: parsed.summary.sourceFingerprint,
      backupPath: path.join(backupRoot, `${safeId}.${batchId}.bak.md`),
      temporaryPath: `${target}.restx-${batchId}.tmp`,
      rollbackPath: `${target}.restx-${batchId}.rollback.tmp`
    })
  }

  const renameFile = dependencies.renameFile ?? rename
  const replaced: PreparedEdit[] = []
  try {
    await mkdir(backupRoot, { recursive: true, mode: 0o700 })
    for (const item of prepared) {
      await writeFile(item.backupPath, item.original, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await writeFile(item.temporaryPath, item.updated, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    }
    for (const item of prepared) {
      const current = await readOriginal(resolvedRoot, item.target)
      const currentFingerprint = parseKnowledgeMarkdown(current, item.edit.problemId).summary.sourceFingerprint
      if (currentFingerprint !== item.originalFingerprint) {
        throw new KnowledgeWriteError('部分问题文件已发生变化，请刷新后重新编辑。', 'SOURCE_CONFLICT')
      }
      await renameFile(item.temporaryPath, item.target)
      replaced.push(item)
    }
  } catch (error) {
    let rollbackComplete = true
    for (const item of [...replaced].reverse()) {
      try {
        await writeFile(item.rollbackPath, item.original, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
        await renameFile(item.rollbackPath, item.target)
      } catch {
        rollbackComplete = false
      }
    }
    await Promise.all(prepared.flatMap((item) => [
      unlink(item.temporaryPath).catch(() => undefined),
      unlink(item.rollbackPath).catch(() => undefined)
    ]))
    if (!rollbackComplete) {
      throw new KnowledgeWriteError('批量写入失败，且部分文件未能自动恢复；请检查备份目录。', 'ROLLBACK_FAILED')
    }
    if (error instanceof KnowledgeWriteError) throw error
    if (error instanceof KnowledgeFileAccessError) throw new KnowledgeWriteError(error.message, error.code)
    throw new KnowledgeWriteError('批量写入失败，已恢复此前修改。', 'WRITE_FAILED')
  }

  return prepared.map((item) => parseKnowledgeMarkdown(item.updated, item.edit.problemId))
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
  const [result] = await applyKnowledgeEdits({
    root,
    now,
    input: {
      edits: [{
        problemId: input.problemId,
        sourceFingerprint: input.sourceFingerprint,
        classification: {
          scene: validateLabel(input.scene, '场景'),
          capabilities: validateList(input.capabilities, '能力', true),
          knowledge: validateList(input.knowledge, '知识', true)
        }
      }]
    }
  })
  return result
}
