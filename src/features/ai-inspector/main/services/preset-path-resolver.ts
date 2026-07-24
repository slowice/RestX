import { lstat, realpath, readdir } from 'node:fs/promises'
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

type WildcardTrustBoundary = {
  path: string
  allowsMacTmpAlias: boolean
}

function trustedTemplateBase(template: string, resolvedTemplate: string, environment: PresetPathEnvironment): WildcardTrustBoundary {
  const variable = template.match(/^\$\{(HOME|TEMP|UID)\}(?:[\\/]|$)/)?.[1]
  if (variable === 'HOME') return { path: path.resolve(environment.homeDirectory), allowsMacTmpAlias: false }
  if (variable === 'TEMP') return { path: path.resolve(environment.tempDirectory), allowsMacTmpAlias: false }
  if (variable === 'UID' && environment.uid) return { path: path.resolve(environment.uid), allowsMacTmpAlias: false }
  return { path: path.parse(resolvedTemplate).root, allowsMacTmpAlias: environment.platform === 'darwin' }
}

async function hasSafeWildcardParent(parentPath: string, boundary: WildcardTrustBoundary): Promise<boolean> {
  const trustedBase = boundary.path
  const relativeParent = path.relative(trustedBase, parentPath)
  if (relativeParent === '') return true
  if (relativeParent === '..' || relativeParent.startsWith(`..${path.sep}`) || path.isAbsolute(relativeParent)) return false

  let currentPath = trustedBase
  try {
    for (const [index, segment] of relativeParent.split(path.sep).entries()) {
      currentPath = path.join(currentPath, segment)
      if (boundary.allowsMacTmpAlias && index === 0 && currentPath === path.join(trustedBase, 'tmp')) continue
      if ((await lstat(currentPath)).isSymbolicLink()) return false
    }
    return true
  } catch (error) {
    if (isUnavailablePathError(error)) return false
    throw error
  }
}

async function resolveTerminalWildcard(resolvedTemplate: string, boundary: WildcardTrustBoundary): Promise<string[]> {
  const parentPath = path.dirname(resolvedTemplate)
  const basenamePattern = path.basename(resolvedTemplate)
  if (!basenamePattern.includes('*')) return []

  try {
    if (!await hasSafeWildcardParent(parentPath, boundary)) return []
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
  if (hasRelativePath && expanded.includes('*')) return []

  const resolvedPath = hasRelativePath
    ? path.resolve(rootPath, expanded)
    : path.resolve(expanded)
  if (hasRelativePath && !isWithinRoot(rootPath, resolvedPath)) return []

  const hasTerminalWildcard = path.basename(resolvedPath).includes('*')
  if (resolvedPath.includes('*') && !hasTerminalWildcard) return []
  return hasTerminalWildcard
    ? resolveTerminalWildcard(resolvedPath, trustedTemplateBase(template, resolvedPath, environment))
    : (await hasSafeWildcardParent(path.dirname(resolvedPath), trustedTemplateBase(template, resolvedPath, environment)))
      ? [resolvedPath]
      : []
}
