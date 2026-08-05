import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MailDraft } from '../shared/contracts'
import { readMailDraft } from '../shared/template-engine'
import { findClassicOutlookPath } from './classic-outlook'
import {
  formatMailLaunchTimestamp,
  mailLaunchLogger,
  summarizeMailLaunchError,
  type MailLaunchLogEvent
} from './mail-launch-logger'

const OUTLOOK_TIMEOUT_MS = 20_000
const READY_MARKER = 'RESTX_OUTLOOK_DRAFT_READY'

export const OUTLOOK_DRAFT_SCRIPT = String.raw`param(
  [Parameter(Mandatory = $true)]
  [string]$PayloadPath
)
$ErrorActionPreference = 'Stop'
$outlook = $null
$mail = $null
try {
  $payload = Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
  try {
    $outlook = New-Object -ComObject Outlook.Application
  } catch {
    [Console]::Error.WriteLine('RESTX_OUTLOOK_UNAVAILABLE')
    exit 21
  }
  $mail = $outlook.CreateItem(0)
  $mail.BodyFormat = 2
  $mail.Display($false)
  Start-Sleep -Milliseconds 120
  $signature = [string]$mail.HTMLBody
  $templateBody = [string]$payload.bodyHtml
  if ([string]::IsNullOrWhiteSpace($signature)) {
    $mail.HTMLBody = $templateBody
  } else {
    $bodyStart = [regex]::Match($signature, '(?is)<body\b[^>]*>')
    if ($bodyStart.Success) {
      $insertAt = $bodyStart.Index + $bodyStart.Length
      $mail.HTMLBody = $signature.Insert($insertAt, $templateBody + '<br><br>')
    } else {
      $mail.HTMLBody = $templateBody + '<br><br>' + $signature
    }
  }
  $mail.To = (($payload.to | ForEach-Object { [string]$_ }) -join '; ')
  $mail.CC = (($payload.cc | ForEach-Object { [string]$_ }) -join '; ')
  $mail.BCC = (($payload.bcc | ForEach-Object { [string]$_ }) -join '; ')
  $mail.Subject = [string]$payload.subject
  [Console]::Out.WriteLine('RESTX_OUTLOOK_DRAFT_READY')
  exit 0
} catch {
  [Console]::Error.WriteLine('RESTX_OUTLOOK_FAILED')
  exit 22
} finally {
  if ($null -ne $mail) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($mail) }
  if ($null -ne $outlook) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($outlook) }
}
`

export type ProcessResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean }

export type OutlookDraftDependencies = {
  platform: NodeJS.Platform
  findOutlookPath(): Promise<string>
  makeTempDirectory(prefix: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  removeDirectory(path: string): Promise<void>
  runPowerShell(scriptPath: string, payloadPath: string, timeoutMs: number): Promise<ProcessResult>
  writeLog(event: Omit<MailLaunchLogEvent, 'timestamp'>): Promise<void>
}

const defaultDependencies: OutlookDraftDependencies = {
  platform: process.platform,
  findOutlookPath: () => findClassicOutlookPath(),
  makeTempDirectory: (prefix) => mkdtemp(prefix),
  writeFile: (path, content) => writeFile(path, content, { encoding: 'utf8', mode: 0o600 }),
  removeDirectory: (path) => rm(path, { recursive: true, force: true }),
  runPowerShell,
  writeLog: (event) => mailLaunchLogger.write({ timestamp: formatMailLaunchTimestamp(), ...event })
}

export async function openClassicOutlookDraft(input: unknown, dependencies: OutlookDraftDependencies = defaultDependencies): Promise<void> {
  const draft = readMailDraft(input)
  if (dependencies.platform !== 'win32') throw new Error('自动打开富文本草稿仅支持 Windows 经典 Outlook，请复制富文本正文后手动粘贴。')
  const outlookPath = await dependencies.findOutlookPath()

  const directory = await dependencies.makeTempDirectory(join(tmpdir(), 'restx-outlook-draft-'))
  const scriptPath = join(directory, 'open-outlook-draft.ps1')
  const payloadPath = join(directory, 'draft.json')
  try {
    await dependencies.writeFile(scriptPath, OUTLOOK_DRAFT_SCRIPT)
    await dependencies.writeFile(payloadPath, JSON.stringify(serializeDraft(draft)))
    const result = await dependencies.runPowerShell(scriptPath, payloadPath, OUTLOOK_TIMEOUT_MS)
    if (result.timedOut) throw new Error('打开经典 Outlook 超时，请复制富文本正文后手动粘贴。')
    if (result.code === 0 && result.stdout.includes(READY_MARKER)) {
      await dependencies.writeLog({ stage: 'launch', outcome: 'success', outlookPath }).catch(() => undefined)
      return
    }
    if (result.stderr.includes('RESTX_OUTLOOK_UNAVAILABLE')) throw new Error('未找到可用的 Windows 经典 Outlook，请确认已安装并完成首次启动。')
    if (result.stderr.includes('RESTX_POWERSHELL_UNAVAILABLE')) throw new Error('系统无法启动 PowerShell，请复制富文本正文后手动粘贴。')
    if (result.stderr.includes('running scripts is disabled') || result.stderr.includes('UnauthorizedAccess')) throw new Error('PowerShell 被系统策略阻止，请复制富文本正文后手动粘贴。')
    throw new Error('经典 Outlook 无法创建邮件草稿，请复制富文本正文后手动粘贴。')
  } catch (reason) {
    await dependencies.writeLog({
      stage: 'launch', outcome: 'failure', code: 'OUTLOOK_LAUNCH_FAILED', outlookPath,
      error: summarizeMailLaunchError(reason)
    }).catch(() => undefined)
    throw reason
  } finally {
    await dependencies.removeDirectory(directory).catch(() => undefined)
  }
}

export function serializeDraft(draft: MailDraft): Pick<MailDraft, 'to' | 'cc' | 'bcc' | 'subject' | 'bodyHtml'> {
  return { to: draft.to, cc: draft.cc, bcc: draft.bcc, subject: draft.subject, bodyHtml: draft.bodyHtml }
}

function runPowerShell(scriptPath: string, payloadPath: string, timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', scriptPath, '-PayloadPath', payloadPath], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { if (stdout.length < 4096) stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { if (stderr.length < 4096) stderr += chunk.toString('utf8') })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr: `${stderr}\nRESTX_POWERSHELL_UNAVAILABLE`, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}
