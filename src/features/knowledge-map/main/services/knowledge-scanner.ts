import { lstat, mkdir, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { KnowledgeScanSkip } from '../../shared/contracts'
import { parseKnowledgeMarkdown, type ParsedKnowledgeMarkdown } from './markdown-parser'

export type KnowledgeScanLimits = {
  maxFiles: number
  maxDepth: number
  maxFileBytes: number
}

export type KnowledgeScanSnapshot = {
  problems: Array<ParsedKnowledgeMarkdown & { absolutePath: string }>
  skipped: KnowledgeScanSkip[]
}

const DEFAULT_LIMITS: KnowledgeScanLimits = {
  maxFiles: 5_000,
  maxDepth: 12,
  maxFileBytes: 2_000_000
}

function relativeId(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join('/')
}

export async function scanKnowledgeRoot(
  root: string,
  limits: Partial<KnowledgeScanLimits> = {}
): Promise<KnowledgeScanSnapshot> {
  const resolvedLimits = { ...DEFAULT_LIMITS, ...limits }
  const problems: KnowledgeScanSnapshot['problems'] = []
  const skipped: KnowledgeScanSkip[] = []
  let visitedFiles = 0
  await mkdir(root, { recursive: true, mode: 0o700 })

  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > resolvedLimits.maxDepth) {
      skipped.push({ id: relativeId(root, directory), reason: 'depth-limit' })
      return
    }
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      const id = relativeId(root, absolutePath)
      if (entry.name.startsWith('.') || entry.name === '.restx-backup') continue
      if (entry.isSymbolicLink()) {
        skipped.push({ id, reason: 'symbolic-link' })
        continue
      }
      if (entry.isDirectory()) {
        await visit(absolutePath, depth + 1)
        continue
      }
      if (!entry.isFile() || !/\.(?:md|markdown)$/i.test(entry.name)) continue
      if (visitedFiles >= resolvedLimits.maxFiles) {
        skipped.push({ id, reason: 'file-limit' })
        continue
      }
      visitedFiles += 1
      try {
        const stats = await lstat(absolutePath)
        if (stats.isSymbolicLink()) {
          skipped.push({ id, reason: 'symbolic-link' })
          continue
        }
        if (stats.size > resolvedLimits.maxFileBytes) {
          skipped.push({ id, reason: 'file-too-large' })
          continue
        }
        const content = await readFile(absolutePath, 'utf8')
        problems.push({
          ...parseKnowledgeMarkdown(content, id, { sizeBytes: stats.size, modifiedAt: stats.mtime }),
          absolutePath
        })
      } catch {
        skipped.push({ id, reason: 'read-failed' })
      }
    }
  }

  await visit(root, 0)
  problems.sort((left, right) => left.summary.id.localeCompare(right.summary.id))
  return { problems, skipped }
}

