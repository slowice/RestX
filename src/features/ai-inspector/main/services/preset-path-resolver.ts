import { realpath, readdir } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import type { AiToolPathFields } from '../../shared/contracts/ai-tool-preset'

const MAX_WILDCARD_MATCHES = 32

export type PresetPathEnvironment = {
  homeDirectory: string
  tempDirectory: string
  uid?: string
  platform: NodeJS.Platform
}

export function createPresetPathEnvironment(): PresetPathEnvironment {
  return {
    homeDirectory: homedir(),
    tempDirectory: tmpdir(),
    uid: process.getuid?.()?.toString(),
    platform: process.platform
  }
}

function isUnavailablePathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'EACCES' || code === 'EPERM'
}

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function expandPathTemplate(template: string, environment: PresetPathEnvironment): string | null {
  if (template.includes('${UID}') && !environment.uid) return null
  return template
    .replaceAll('${HOME}', environment.homeDirectory)
    .replaceAll('${TEMP}', environment.tempDirectory)
    .replaceAll('${UID}', environment.uid ?? '')
    .replace(/[\\/]+/g, path.sep)
}

function terminalWildcardPattern(value: string): RegExp {
  return new RegExp(`^${value.split('*').map((segment) => segment.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')).join('.*')}$`, 'i')
}

async function resolveTerminalWildcard(resolvedTemplate: string): Promise<string[]> {
  const parentPath = path.dirname(resolvedTemplate)
  const basenamePattern = path.basename(resolvedTemplate)
  if (!basenamePattern.includes('*')) return []

  try {
    const matcher = terminalWildcardPattern(basenamePattern)
    const children = await readdir(parentPath, { withFileTypes: true })
    const locations = await Promise.all(children
      .filter((child) => !child.isSymbolicLink() && (child.isFile() || child.isDirectory()) && matcher.test(child.name))
      .map(async (child) => {
        try {
          return await realpath(path.join(parentPath, child.name))
        } catch (error) {
          if (isUnavailablePathError(error)) return null
          throw error
        }
      }))
    return [...new Set(locations.filter((location): location is string => location !== null))]
      .sort((left, right) => left.localeCompare(right))
      .slice(0, MAX_WILDCARD_MATCHES)
  } catch (error) {
    if (isUnavailablePathError(error)) return []
    throw error
  }
}

export async function resolvePresetPaths(
  rootPath: string,
  declaration: AiToolPathFields,
  environment: PresetPathEnvironment = createPresetPathEnvironment()
): Promise<string[]> {
  if (declaration.platforms && !declaration.platforms.includes(environment.platform)) return []

  const hasRelativePath = typeof declaration.relativePath === 'string'
  const template = hasRelativePath ? declaration.relativePath : declaration.path
  const expanded = expandPathTemplate(template, environment)
  if (!expanded) return []

  const resolvedPath = hasRelativePath
    ? path.resolve(rootPath, expanded)
    : path.resolve(expanded)
  if (hasRelativePath && !isWithinRoot(rootPath, resolvedPath)) return []

  const hasTerminalWildcard = path.basename(resolvedPath).includes('*')
  if (resolvedPath.includes('*') && !hasTerminalWildcard) return []
  return hasTerminalWildcard ? resolveTerminalWildcard(resolvedPath) : [resolvedPath]
}
