import { EventEmitter } from 'node:events'
import type { ChildProcess, ExecException } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  buildClassicOutlookCommand,
  ClassicOutlookError,
  findClassicOutlookPath,
  openWithClassicOutlook,
  parseRegistryOutlookPath,
  type ClassicOutlookDependencies
} from '../src/features/mail-template/main/classic-outlook'
import type { MailLaunchLogEvent, MailLaunchLogger } from '../src/features/mail-template/main/mail-launch-logger'

const outlookPath = 'C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE'

function captureLogger(): { events: MailLaunchLogEvent[]; logger: MailLaunchLogger } {
  const events: MailLaunchLogEvent[] = []
  return { events, logger: { write: async (event) => { events.push(event) } } }
}

function windowsDependencies(overrides: ClassicOutlookDependencies = {}): ClassicOutlookDependencies {
  return {
    platform: 'win32',
    environment: { ProgramFiles: 'C:\\Program Files' },
    queryRegistry: vi.fn(async () => null),
    stat: vi.fn(async () => ({ isFile: () => false })),
    logger: { write: vi.fn(async () => undefined) },
    ...overrides
  }
}

describe('classic Outlook discovery', () => {
  it('parses registry string values and expands Windows environment variables', () => {
    expect(parseRegistryOutlookPath([
      'HKEY_LOCAL_MACHINE\\Software\\Microsoft',
      '    (Default)    REG_EXPAND_SZ    %ProgramFiles%\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE'
    ].join('\r\n'), { ProgramFiles: 'C:\\Program Files' })).toBe(outlookPath)
  })

  it('prefers the first valid registry result before common installation paths', async () => {
    const queryRegistry = vi.fn(async (location: string, view: string) => location === 'HKCU' && view === '32' ? outlookPath : null)
    const stat = vi.fn(async (candidate: string) => ({ isFile: () => candidate === outlookPath }))

    await expect(findClassicOutlookPath(windowsDependencies({ queryRegistry, stat }))).resolves.toBe(outlookPath)
    expect(queryRegistry.mock.calls).toEqual([['HKCU', '64'], ['HKCU', '32']])
    expect(stat).toHaveBeenCalledTimes(1)
  })

  it('falls back to a validated common Office path after registry misses', async () => {
    const stat = vi.fn(async (candidate: string) => ({ isFile: () => candidate === outlookPath }))

    await expect(findClassicOutlookPath(windowsDependencies({ stat }))).resolves.toBe(outlookPath)
    expect(stat).toHaveBeenCalledWith(outlookPath)
  })

  it('fails closed on unsupported platforms and missing Outlook with redacted logs', async () => {
    const unsupported = captureLogger()
    await expect(findClassicOutlookPath({ platform: 'darwin', logger: unsupported.logger })).rejects.toMatchObject({ code: 'UNSUPPORTED_PLATFORM' })
    expect(unsupported.events).toEqual([expect.objectContaining({ stage: 'discovery', outcome: 'failure', code: 'UNSUPPORTED_PLATFORM' })])

    const missing = captureLogger()
    await expect(findClassicOutlookPath(windowsDependencies({ logger: missing.logger }))).rejects.toMatchObject({ code: 'OUTLOOK_NOT_FOUND' })
    const serialized = JSON.stringify(missing.events)
    expect(serialized).toContain('OUTLOOK_NOT_FOUND')
    expect(serialized).not.toContain('mailto:')
    expect(serialized).not.toContain('secret@example.com')
  })
})

describe('classic Outlook launch', () => {
  it('builds the registered command shape and protects encoded percent sequences', () => {
    const command = buildClassicOutlookCommand(outlookPath, 'mailto:one%40example.com;two%40example.com?subject=A%20B&body=one%0Atwo')
    expect(command).toBe('"C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE" -c IPM.Note /mailto "mailto:one%%40example.com;two%%40example.com?subject=A%%20B&body=one%%0Atwo"')
    expect(() => buildClassicOutlookCommand(outlookPath, 'mailto:test@example.com" & calc.exe')).toThrow(ClassicOutlookError)
  })

  it('uses exec and resolves on shell spawn without waiting for process exit', async () => {
    const child = new EventEmitter() as ChildProcess
    let callback: ((error: ExecException | null) => void) | undefined
    const exec = vi.fn((command: string, _options: { windowsHide: boolean }, next: (error: ExecException | null) => void) => {
      callback = next
      queueMicrotask(() => child.emit('spawn'))
      return child
    })
    const logger = captureLogger()
    const launch = openWithClassicOutlook('mailto:one%40example.com?subject=Hello', windowsDependencies({
      queryRegistry: vi.fn(async () => outlookPath),
      stat: vi.fn(async () => ({ isFile: () => true })),
      exec,
      logger: logger.logger
    }))

    await expect(launch).resolves.toBeUndefined()
    expect(callback).toBeTypeOf('function')
    expect(exec).toHaveBeenCalledWith(
      '"C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE" -c IPM.Note /mailto "mailto:one%%40example.com?subject=Hello"',
      { windowsHide: true },
      expect.any(Function)
    )
    expect(logger.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'launch', outcome: 'success', outlookPath })
    ]))
  })

  it('reports immediate launch failures without logging the mail command', async () => {
    const child = new EventEmitter() as ChildProcess
    const exec = vi.fn((_command: string, _options: { windowsHide: boolean }, callback: (error: ExecException | null) => void) => {
      queueMicrotask(() => callback(Object.assign(new Error('mailto:secret@example.com subject'), { code: 1 }) as unknown as ExecException))
      return child
    })
    const logger = captureLogger()

    await expect(openWithClassicOutlook('mailto:secret%40example.com?subject=private', windowsDependencies({
      queryRegistry: vi.fn(async () => outlookPath),
      stat: vi.fn(async () => ({ isFile: () => true })),
      exec,
      logger: logger.logger
    }))).rejects.toMatchObject({ code: 'OUTLOOK_LAUNCH_FAILED' })
    const serialized = JSON.stringify(logger.events)
    expect(serialized).toContain('"code":"1"')
    expect(serialized).not.toContain('secret@example.com')
    expect(serialized).not.toContain('subject=private')
  })
})
