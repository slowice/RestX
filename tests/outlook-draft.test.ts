import { describe, expect, it, vi } from 'vitest'
import {
  openClassicOutlookDraft,
  OUTLOOK_DRAFT_SCRIPT,
  type OutlookDraftDependencies,
  type ProcessResult
} from '../src/features/mail-template/main/outlook-draft'

const draft = { to: ['user@example.com'], cc: [], bcc: [], subject: '主题 & "quoted"', bodyHtml: '<table><tr><td>正文</td></tr></table>', bodyText: '正文' }

function dependencies(result: ProcessResult = { code: 0, stdout: 'RESTX_OUTLOOK_DRAFT_READY', stderr: '', timedOut: false }) {
  const writes = new Map<string, string>()
  const removeDirectory = vi.fn(async () => undefined)
  const runPowerShell = vi.fn(async () => result)
  const writeLog = vi.fn(async () => undefined)
  const value: OutlookDraftDependencies = {
    platform: 'win32',
    findOutlookPath: vi.fn(async () => 'C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE'),
    makeTempDirectory: vi.fn(async () => '/private/tmp/restx-outlook-test'),
    writeFile: vi.fn(async (path, content) => { writes.set(path, content) }),
    removeDirectory,
    runPowerShell,
    writeLog
  }
  return { value, writes, removeDirectory, runPowerShell, writeLog }
}

describe('classic Outlook rich draft adapter', () => {
  it('uses a fixed script and isolated JSON payload, then cleans up', async () => {
    const deps = dependencies()
    await openClassicOutlookDraft(draft, deps.value)
    expect(deps.runPowerShell).toHaveBeenCalledWith(
      '/private/tmp/restx-outlook-test/open-outlook-draft.ps1',
      '/private/tmp/restx-outlook-test/draft.json',
      20_000
    )
    expect(deps.writes.get('/private/tmp/restx-outlook-test/open-outlook-draft.ps1')).toBe(OUTLOOK_DRAFT_SCRIPT)
    expect(JSON.parse(deps.writes.get('/private/tmp/restx-outlook-test/draft.json') ?? '{}')).toMatchObject({ subject: draft.subject, bodyHtml: draft.bodyHtml })
    expect(OUTLOOK_DRAFT_SCRIPT).toContain('$mail.Display($false)')
    expect(OUTLOOK_DRAFT_SCRIPT).toContain('$signature')
    expect(OUTLOOK_DRAFT_SCRIPT).not.toMatch(/\.Send\s*\(/)
    expect(deps.removeDirectory).toHaveBeenCalledTimes(1)
    expect(deps.writeLog).toHaveBeenCalledWith(expect.objectContaining({ stage: 'launch', outcome: 'success' }))
  })

  it('cleans up and maps timeout without exposing message content', async () => {
    const deps = dependencies({ code: null, stdout: '', stderr: '', timedOut: true })
    await expect(openClassicOutlookDraft(draft, deps.value)).rejects.toThrow(/超时/)
    expect(deps.removeDirectory).toHaveBeenCalledTimes(1)
    expect(deps.writeLog).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure', code: 'OUTLOOK_LAUNCH_FAILED' }))
  })

  it('rejects unsupported systems and invalid HTML before starting a process', async () => {
    const unsupported = dependencies()
    unsupported.value.platform = 'darwin'
    await expect(openClassicOutlookDraft(draft, unsupported.value)).rejects.toThrow(/仅支持 Windows/)
    expect(unsupported.runPowerShell).not.toHaveBeenCalled()

    const invalid = dependencies()
    await expect(openClassicOutlookDraft({ ...draft, bodyHtml: '<p onclick="bad()">正文</p>' }, invalid.value)).rejects.toThrow(/不安全/)
    expect(invalid.runPowerShell).not.toHaveBeenCalled()
  })
})
