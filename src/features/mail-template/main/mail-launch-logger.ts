import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getRestxStorageLayout } from '../../../platform/main/storage'

export type MailLaunchErrorCode = 'UNSUPPORTED_PLATFORM' | 'OUTLOOK_NOT_FOUND' | 'OUTLOOK_LAUNCH_FAILED'

export type MailLaunchLogEvent = {
  timestamp: string
  stage: 'discovery' | 'launch'
  outcome: 'success' | 'skipped' | 'failure'
  code?: MailLaunchErrorCode
  source?: string
  outlookPath?: string
  error?: { name: string; code?: string }
}

export interface MailLaunchLogger {
  write(event: MailLaunchLogEvent): Promise<void>
}

export function formatMailLaunchTimestamp(date = new Date(), timezoneOffsetMinutes = date.getTimezoneOffset()): string {
  const localDate = new Date(date.getTime() - timezoneOffsetMinutes * 60_000)
  const localTime = localDate.toISOString().slice(0, -1)
  const sign = timezoneOffsetMinutes <= 0 ? '+' : '-'
  const offset = Math.abs(timezoneOffsetMinutes)
  return `${localTime}${sign}${String(Math.floor(offset / 60)).padStart(2, '0')}:${String(offset % 60).padStart(2, '0')}`
}

export function summarizeMailLaunchError(reason: unknown): { name: string; code?: string } {
  if (!reason || typeof reason !== 'object') return { name: typeof reason }
  const name = 'name' in reason && typeof reason.name === 'string' ? reason.name : 'Error'
  const rawCode = 'code' in reason ? reason.code : undefined
  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode) : undefined
  return { name, ...(code ? { code } : {}) }
}

class FileMailLaunchLogger implements MailLaunchLogger {
  async write(event: MailLaunchLogEvent): Promise<void> {
    const directory = getRestxStorageLayout().logs
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const filePath = path.join(directory, `mail-template-${event.timestamp.slice(0, 10)}.jsonl`)
    await appendFile(filePath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 })
  }
}

export const mailLaunchLogger: MailLaunchLogger = new FileMailLaunchLogger()
