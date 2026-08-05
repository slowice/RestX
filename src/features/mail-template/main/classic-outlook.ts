import { exec as nodeExec, type ChildProcess, type ExecException } from 'node:child_process'
import { stat as nodeStat } from 'node:fs/promises'
import path from 'node:path'
import {
  formatMailLaunchTimestamp,
  mailLaunchLogger,
  summarizeMailLaunchError,
  type MailLaunchErrorCode,
  type MailLaunchLogger
} from './mail-launch-logger'

const APP_PATHS_KEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\OUTLOOK.EXE'
const REGISTRY_LOCATIONS = ['HKCU', 'HKLM'] as const
const REGISTRY_VIEWS = ['64', '32'] as const
const OFFICE_VERSIONS = ['16', '15', '14'] as const

type RegistryLocation = typeof REGISTRY_LOCATIONS[number]
type RegistryView = typeof REGISTRY_VIEWS[number]
type FileStat = { isFile(): boolean }
type ExecCallback = (error: ExecException | null) => void
type OutlookExec = (command: string, options: { windowsHide: boolean }, callback: ExecCallback) => ChildProcess

export type ClassicOutlookDependencies = {
  platform?: NodeJS.Platform
  environment?: NodeJS.ProcessEnv
  stat?: (filePath: string) => Promise<FileStat>
  queryRegistry?: (location: RegistryLocation, view: RegistryView) => Promise<string | null>
  exec?: OutlookExec
  logger?: MailLaunchLogger
}

export class ClassicOutlookError extends Error {
  constructor(message: string, readonly code: MailLaunchErrorCode) {
    super(message)
    this.name = 'ClassicOutlookError'
  }
}

function environmentValue(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  const entry = Object.entries(environment).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return entry?.[1]
}

function expandWindowsEnvironmentVariables(value: string, environment: NodeJS.ProcessEnv): string {
  return value.replace(/%([^%]+)%/g, (match, name: string) => environmentValue(environment, name) ?? match)
}

export function parseRegistryOutlookPath(output: string, environment: NodeJS.ProcessEnv = process.env): string | null {
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/\bREG_(?:EXPAND_)?SZ\s+(.+?)\s*$/i)
    if (!match) continue
    return expandWindowsEnvironmentVariables(match[1].trim().replace(/^"|"$/g, ''), environment)
  }
  return null
}

async function defaultRegistryQuery(location: RegistryLocation, view: RegistryView): Promise<string | null> {
  const key = `${location}\\${APP_PATHS_KEY}`
  return new Promise((resolve) => {
    nodeExec(`reg.exe query "${key}" /ve /reg:${view}`, { windowsHide: true }, (error, stdout) => {
      resolve(error ? null : parseRegistryOutlookPath(stdout))
    })
  })
}

function commonOutlookCandidates(environment: NodeJS.ProcessEnv): Array<{ path: string; source: string }> {
  const roots = ['ProgramW6432', 'ProgramFiles', 'ProgramFiles(x86)']
    .map((name) => environmentValue(environment, name))
    .filter((value): value is string => Boolean(value?.trim()))
  const seen = new Set<string>()
  const candidates: Array<{ path: string; source: string }> = []
  for (const root of roots) {
    for (const version of OFFICE_VERSIONS) {
      for (const segments of [
        ['Microsoft Office', 'root', `Office${version}`, 'OUTLOOK.EXE'],
        ['Microsoft Office', `Office${version}`, 'OUTLOOK.EXE']
      ]) {
        const candidate = path.win32.join(root, ...segments)
        const normalized = candidate.toLowerCase()
        if (seen.has(normalized)) continue
        seen.add(normalized)
        candidates.push({ path: candidate, source: `common:office${version}` })
      }
    }
  }
  return candidates
}

async function isValidOutlookExecutable(candidate: string, stat: (filePath: string) => Promise<FileStat>): Promise<boolean> {
  if (!path.win32.isAbsolute(candidate) || path.win32.basename(candidate).toLowerCase() !== 'outlook.exe') return false
  return stat(candidate).then((result) => result.isFile(), () => false)
}

async function writeLog(logger: MailLaunchLogger, event: Omit<Parameters<MailLaunchLogger['write']>[0], 'timestamp'>): Promise<void> {
  await logger.write({ timestamp: formatMailLaunchTimestamp(), ...event }).catch(() => undefined)
}

export async function findClassicOutlookPath(dependencies: ClassicOutlookDependencies = {}): Promise<string> {
  const platform = dependencies.platform ?? process.platform
  const environment = dependencies.environment ?? process.env
  const stat = dependencies.stat ?? nodeStat
  const queryRegistry = dependencies.queryRegistry ?? defaultRegistryQuery
  const logger = dependencies.logger ?? mailLaunchLogger

  if (platform !== 'win32') {
    const error = new ClassicOutlookError('邮件功能当前仅支持 Windows 经典 Outlook。', 'UNSUPPORTED_PLATFORM')
    await writeLog(logger, { stage: 'discovery', outcome: 'failure', code: error.code })
    throw error
  }

  for (const location of REGISTRY_LOCATIONS) {
    for (const view of REGISTRY_VIEWS) {
      const source = `registry:${location.toLowerCase()}:${view}`
      const candidate = await queryRegistry(location, view).catch(() => null)
      if (candidate && await isValidOutlookExecutable(candidate, stat)) {
        await writeLog(logger, { stage: 'discovery', outcome: 'success', source, outlookPath: candidate })
        return candidate
      }
      await writeLog(logger, { stage: 'discovery', outcome: 'skipped', source })
    }
  }

  for (const candidate of commonOutlookCandidates(environment)) {
    if (await isValidOutlookExecutable(candidate.path, stat)) {
      await writeLog(logger, { stage: 'discovery', outcome: 'success', source: candidate.source, outlookPath: candidate.path })
      return candidate.path
    }
  }

  const error = new ClassicOutlookError('未找到经典 Outlook，请确认已安装桌面版 Outlook。', 'OUTLOOK_NOT_FOUND')
  await writeLog(logger, { stage: 'discovery', outcome: 'failure', code: error.code })
  throw error
}

function assertSafeCommandValue(value: string, label: string): void {
  if (!value || /["\r\n\0]/.test(value)) throw new ClassicOutlookError(`${label}无效。`, 'OUTLOOK_LAUNCH_FAILED')
}

export function buildClassicOutlookCommand(outlookPath: string, mailtoUri: string): string {
  assertSafeCommandValue(outlookPath, '经典 Outlook 路径')
  assertSafeCommandValue(mailtoUri, '邮件 URI')
  if (!path.win32.isAbsolute(outlookPath) || path.win32.basename(outlookPath).toLowerCase() !== 'outlook.exe' || !mailtoUri.startsWith('mailto:')) {
    throw new ClassicOutlookError('经典 Outlook 启动参数无效。', 'OUTLOOK_LAUNCH_FAILED')
  }
  const shellSafePath = outlookPath.replace(/%/g, '%%')
  const shellSafeUri = mailtoUri.replace(/%/g, '%%')
  return `"${shellSafePath}" -c IPM.Note /mailto "${shellSafeUri}"`
}

const defaultOutlookExec: OutlookExec = (command, options, callback) => nodeExec(command, options, callback)

export async function openWithClassicOutlook(mailtoUri: string, dependencies: ClassicOutlookDependencies = {}): Promise<void> {
  const logger = dependencies.logger ?? mailLaunchLogger
  const outlookPath = await findClassicOutlookPath(dependencies)
  const command = buildClassicOutlookCommand(outlookPath, mailtoUri)
  const exec = dependencies.exec ?? defaultOutlookExec

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const fail = (reason: unknown): void => {
      void writeLog(logger, {
        stage: 'launch', outcome: 'failure', code: 'OUTLOOK_LAUNCH_FAILED', outlookPath,
        error: summarizeMailLaunchError(reason)
      })
      if (settled) return
      settled = true
      reject(new ClassicOutlookError('无法启动经典 Outlook，请查看日志后重试。', 'OUTLOOK_LAUNCH_FAILED'))
    }

    let child: ChildProcess
    try {
      child = exec(command, { windowsHide: true }, (error) => {
        if (error) fail(error)
      })
    } catch (reason) {
      fail(reason)
      return
    }
    child.once('error', fail)
    child.once('spawn', () => {
      if (settled) return
      settled = true
      void writeLog(logger, { stage: 'launch', outcome: 'success', outlookPath })
      resolve()
    })
  })
}
