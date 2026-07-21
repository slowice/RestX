import { app } from 'electron'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export type AiCallLogEvent = {
  timestamp: string
  callId: string
  phase: 'request' | 'response' | 'error'
  endpoint: string
  model: string
  durationMs?: number
  httpStatus?: number
  payload?: unknown
  error?: { name: string; code?: string; message: string }
}

export interface AiCallLogger {
  write(event: AiCallLogEvent): Promise<void>
}

export function getAiLogDirectory(): string {
  return path.join(app.getPath('home'), '.RestX', 'log')
}

export function formatLogTimestamp(date = new Date(), timezoneOffsetMinutes = date.getTimezoneOffset()): string {
  const localDate = new Date(date.getTime() - timezoneOffsetMinutes * 60_000)
  const localTime = localDate.toISOString().slice(0, -1)
  const offsetSign = timezoneOffsetMinutes <= 0 ? '+' : '-'
  const absoluteOffset = Math.abs(timezoneOffsetMinutes)
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0')
  const minutes = String(absoluteOffset % 60).padStart(2, '0')
  return `${localTime}${offsetSign}${hours}:${minutes}`
}

export async function ensureAiLogDirectory(): Promise<string> {
  const directory = getAiLogDirectory()
  await mkdir(directory, { recursive: true, mode: 0o700 })
  return directory
}

class FileAiCallLogger implements AiCallLogger {
  async write(event: AiCallLogEvent): Promise<void> {
    const directory = await ensureAiLogDirectory()
    const date = event.timestamp.slice(0, 10)
    const filePath = path.join(directory, `ai-calls-${date}.jsonl`)
    await appendFile(filePath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 })
  }
}

export const aiCallLogger: AiCallLogger = new FileAiCallLogger()
