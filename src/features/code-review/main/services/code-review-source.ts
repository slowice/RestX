import type { MergeRequestLocator, ReviewPlatform, ReviewSourcePreview, ReviewZone } from '../../shared/contracts/code-review'

export class ReviewSourceError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ReviewSourceError'
  }
}

export type ChangedReviewFile = ReviewSourcePreview['files'][number] & {
  patch: string
  changedNewLines: Set<number>
}

export type LoadedReviewSource = {
  preview: ReviewSourcePreview
  files: ChangedReviewFile[]
}

export interface MergeRequestSourceAdapter {
  readonly id: ReviewPlatform
  readonly zone: ReviewZone
  matches(url: URL): boolean
  parseUrl(url: URL): MergeRequestLocator
  load(locator: MergeRequestLocator): Promise<LoadedReviewSource>
}

export class MergeRequestAdapterRegistry {
  constructor(private readonly adapters: MergeRequestSourceAdapter[]) {}

  resolve(input: string): { adapter: MergeRequestSourceAdapter; locator: MergeRequestLocator } {
    let url: URL
    try {
      url = new URL(input.trim())
    } catch {
      throw new ReviewSourceError('请输入完整的 GitCode 或 CodeHub MR/PR 链接。', 'INVALID_URL')
    }
    if (url.protocol !== 'https:') throw new ReviewSourceError('代码平台链接必须使用 HTTPS。', 'INVALID_URL')
    const adapter = this.adapters.find((candidate) => candidate.matches(url))
    if (!adapter) throw new ReviewSourceError('当前只支持 GitCode PR 链接；CodeHub 将在黄区补充接口后启用。', 'UNSUPPORTED_PLATFORM')
    return { adapter, locator: adapter.parseUrl(url) }
  }
}

export function parseChangedNewLines(patch: string): Set<number> {
  const lines = new Set<number>()
  let newLine = 0
  for (const line of patch.split('\n')) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (header) {
      newLine = Number(header[1])
      continue
    }
    if (!newLine || line.startsWith('\\ No newline')) continue
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.add(newLine)
      newLine += 1
    } else if (!line.startsWith('-')) {
      newLine += 1
    }
  }
  return lines
}
