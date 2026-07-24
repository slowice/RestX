import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'

export const MAX_KNOWLEDGE_FILE_BYTES = 2_000_000

export class KnowledgeFileAccessError extends Error {
  constructor(message: string, readonly code: 'SOURCE_UNAVAILABLE' | 'SOURCE_TOO_LARGE') {
    super(message)
    this.name = 'KnowledgeFileAccessError'
  }
}

function isInsideRoot(root: string, target: string): boolean {
  return target.startsWith(`${root}${path.sep}`)
}

export async function readSafeKnowledgeFile(
  root: string,
  target: string
): Promise<{ content: string; sizeBytes: number; modifiedAt: Date }> {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  if (!isInsideRoot(resolvedRoot, resolvedTarget)) {
    throw new KnowledgeFileAccessError('问题文件超出知识目录。', 'SOURCE_UNAVAILABLE')
  }

  try {
    const linkStats = await lstat(resolvedTarget)
    if (linkStats.isSymbolicLink() || !linkStats.isFile()) {
      throw new KnowledgeFileAccessError('问题文件不是普通文件。', 'SOURCE_UNAVAILABLE')
    }

    const [realRoot, realTarget] = await Promise.all([
      realpath(resolvedRoot),
      realpath(resolvedTarget)
    ])
    if (!isInsideRoot(realRoot, realTarget)) {
      throw new KnowledgeFileAccessError('问题文件超出知识目录。', 'SOURCE_UNAVAILABLE')
    }

    const handle = await open(resolvedTarget, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stats = await handle.stat()
      if (!stats.isFile()) {
        throw new KnowledgeFileAccessError('问题文件不是普通文件。', 'SOURCE_UNAVAILABLE')
      }
      if (stats.size > MAX_KNOWLEDGE_FILE_BYTES) {
        throw new KnowledgeFileAccessError('问题文件超过预览大小限制。', 'SOURCE_TOO_LARGE')
      }
      const content = await handle.readFile({ encoding: 'utf8' })
      if (Buffer.byteLength(content, 'utf8') > MAX_KNOWLEDGE_FILE_BYTES) {
        throw new KnowledgeFileAccessError('问题文件超过预览大小限制。', 'SOURCE_TOO_LARGE')
      }
      return { content, sizeBytes: stats.size, modifiedAt: stats.mtime }
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (error instanceof KnowledgeFileAccessError) throw error
    throw new KnowledgeFileAccessError('问题文件已不存在或无法读取。', 'SOURCE_UNAVAILABLE')
  }
}
