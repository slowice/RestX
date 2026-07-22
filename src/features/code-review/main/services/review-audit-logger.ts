import { app } from 'electron'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export type ReviewAuditEvent = {
  timestamp: string
  reviewId: string
  zone: 'blue' | 'yellow'
  sourceHash: string
  fileCount: number
  inputCharacters: number
  model: string
  durationMs: number
  status: 'success' | 'failed' | 'cache-hit'
  findingCount?: number
}

export async function writeReviewAudit(event: ReviewAuditEvent): Promise<void> {
  try {
    const directory = path.join(app.getPath('home'), '.RestX', 'log')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await appendFile(path.join(directory, `code-review-${event.timestamp.slice(0, 10)}.jsonl`), `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 })
  } catch {
    // Metadata diagnostics must not break review.
  }
}
