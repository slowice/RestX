import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MAIL_TEMPLATE_LIMITS } from '../shared/contracts'

const READ_MSG_HTML_SCRIPT = String.raw`param(
  [Parameter(Mandatory = $true)][string]$MessagePath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$outlook = $null
$session = $null
$message = $null
try {
  $outlook = New-Object -ComObject Outlook.Application
  $session = $outlook.GetNamespace('MAPI')
  $message = $session.OpenSharedItem($MessagePath)
  if ($message.Class -ne 43) { throw 'Not a mail item' }
  $html = [string]$message.HTMLBody
  if ([string]::IsNullOrWhiteSpace($html)) { throw 'No HTML representation' }
  [IO.File]::WriteAllText($OutputPath, $html, (New-Object Text.UTF8Encoding($false)))
  [Console]::Out.WriteLine('RESTX_MSG_HTML_READY')
} catch {
  [Console]::Error.WriteLine('RESTX_MSG_HTML_FAILED')
  exit 1
} finally {
  if ($null -ne $message) {
    try { $message.Close(1) } catch {}
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($message)
  }
  if ($null -ne $session) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($session) }
  if ($null -ne $outlook) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($outlook) }
}
`

// Only open an isolated copy; never save, display or change the selected message.
export async function readMsgHtmlWithOutlook(buffer: Buffer): Promise<string> {
  if (process.platform !== 'win32') {
    throw new Error('导入失败：这封 MSG 只有 RTF 富文本正文，请在 Windows 经典 Outlook 中另存为 HTML 格式的 MSG 后重试。')
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'restx-msg-html-'))
  try {
    const messagePath = path.join(directory, 'message.msg')
    const outputPath = path.join(directory, 'body.html')
    const scriptPath = path.join(directory, 'read-msg-html.ps1')
    await writeFile(messagePath, buffer, { mode: 0o600 })
    await writeFile(scriptPath, READ_MSG_HTML_SCRIPT, { mode: 0o600 })
    await runOutlookReader(scriptPath, messagePath, outputPath)
    const output = await stat(outputPath)
    if (output.size > MAIL_TEMPLATE_LIMITS.clipboardHtml * 4) {
      throw new Error('导入失败：Outlook 恢复的富文本正文过大，请缩小邮件内容后重试。')
    }
    const html = await readFile(outputPath, 'utf8')
    if (!html.trim()) throw new Error('导入失败：Outlook 未能恢复这封 MSG 的富文本正文。')
    return html
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

function runOutlookReader(scriptPath: string, messagePath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-File', scriptPath,
      '-MessagePath', messagePath, '-OutputPath', outputPath
    ], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, 20_000)
    child.stdout.on('data', (chunk: Buffer) => { if (stdout.length < 256) stdout += chunk.toString('utf8') })
    child.once('error', () => {
      clearTimeout(timer)
      reject(new Error('导入失败：无法启动 MSG 富文本恢复，请确认 PowerShell 和 Windows 经典 Outlook 可用。'))
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return reject(new Error('导入失败：恢复 MSG 富文本超时。请先打开并完成经典 Outlook 的配置，再重新导入。'))
      if (code === 0 && stdout.includes('RESTX_MSG_HTML_READY')) return resolve()
      reject(new Error('导入失败：无法恢复 MSG 的 RTF 富文本。请确认经典 Outlook 能打开原邮件，或在 Outlook 中转为 HTML 格式另存为 MSG 后重试。'))
    })
  })
}
