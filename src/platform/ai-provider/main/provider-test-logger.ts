import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getRestxStorageLayout } from '../../main/storage'

export type AiProviderResponseIssue = {
  path: string
  expected: string
  actual: string
}

export type AiProviderResponseSummary = {
  contentType: string
  receivedBytes: number
  bodyKind: string
  topLevelKeys?: string[]
  issue?: AiProviderResponseIssue
}

export type AiProviderTestLogEvent = {
  timestamp: string
  providerId: string
  endpoint: string
  model: string
  durationMs: number
  outcome: 'no_response' | 'http_error' | 'invalid_response'
  httpStatus?: number
  response?: AiProviderResponseSummary
  error?: { name: string; code?: string; message: string }
}

export interface AiProviderTestLogger {
  write(event: AiProviderTestLogEvent): Promise<void>
}

export function formatProviderTestTimestamp(
  date = new Date(),
  timezoneOffsetMinutes = date.getTimezoneOffset()
): string {
  const localDate = new Date(date.getTime() - timezoneOffsetMinutes * 60_000)
  const localTime = localDate.toISOString().slice(0, -1)
  const sign = timezoneOffsetMinutes <= 0 ? '+' : '-'
  const offset = Math.abs(timezoneOffsetMinutes)
  return `${localTime}${sign}${String(Math.floor(offset / 60)).padStart(2, '0')}:${String(offset % 60).padStart(2, '0')}`
}

class FileAiProviderTestLogger implements AiProviderTestLogger {
  async write(event: AiProviderTestLogEvent): Promise<void> {
    const directory = getRestxStorageLayout().logs
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const filePath = path.join(directory, `ai-provider-tests-${event.timestamp.slice(0, 10)}.jsonl`)
    await appendFile(filePath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 })
  }
}

export const aiProviderTestLogger: AiProviderTestLogger = new FileAiProviderTestLogger()
