import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { PresetInventoryEntry } from '../../shared/contracts/smart-import'

const MAX_ENTRIES = 2_000
const MAX_DEPTH = 6
const IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'out', 'build', 'coverage', 'target', 'vendor',
  '__pycache__', 'downloads', 'movies', 'music', 'pictures', 'public'
])
const SENSITIVE_ENTRY = /(?:^|[._-])(auth|credentials?|secrets?|tokens?|keychain|private[-_]?keys?)(?:[._-]|$)/i
const SENSITIVE_DIRECTORIES = new Set(['.ssh', '.gnupg', 'keychains', 'cookies'])

export type PresetInventory = {
  entries: PresetInventoryEntry[]
  truncated: boolean
}

function normalizedRelative(rootPath: string, entryPath: string): string {
  return path.relative(rootPath, entryPath).split(path.sep).join('/') || '.'
}

function toolTokens(toolName: string): string[] {
  return toolName.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter((part) => part.length >= 2)
}

function relevance(name: string, tokens: string[]): number {
  const lower = name.toLowerCase()
  if (tokens.some((token) => lower.includes(token))) return 0
  if (['.config', '.local', 'library', 'application support', '.cache'].includes(lower)) return 1
  if (lower.startsWith('.')) return 2
  return 3
}

function resolveHint(rootPath: string, hint: string): string | null {
  const trimmed = hint.trim()
  if (!trimmed) return null
  const withoutHome = trimmed.startsWith('~/') ? trimmed.slice(2) : trimmed
  const resolved = path.resolve(rootPath, withoutHome)
  const relative = path.relative(rootPath, resolved)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)) ? resolved : null
}

export async function collectPresetInventory(rootPath: string, toolName: string, knownPaths: string): Promise<PresetInventory> {
  const entries: PresetInventoryEntry[] = []
  const visited = new Set<string>()
  const tokens = toolTokens(toolName)
  const queue: Array<{ directory: string; depth: number }> = [{ directory: rootPath, depth: 0 }]
  for (const hint of knownPaths.split(/[\n,]/)) {
    const resolved = resolveHint(rootPath, hint)
    if (resolved && resolved !== rootPath) queue.unshift({ directory: resolved, depth: 0 })
  }
  let truncated = false

  while (queue.length > 0 && entries.length < MAX_ENTRIES) {
    const current = queue.shift()!
    if (visited.has(current.directory) || current.depth > MAX_DEPTH) continue
    visited.add(current.directory)
    let children
    try {
      children = await readdir(current.directory, { withFileTypes: true })
    } catch {
      continue
    }
    children.sort((left, right) => relevance(left.name, tokens) - relevance(right.name, tokens) || left.name.localeCompare(right.name))
    for (const child of children) {
      if (entries.length >= MAX_ENTRIES) { truncated = true; break }
      const childPath = path.join(current.directory, child.name)
      const relativePath = normalizedRelative(rootPath, childPath)
      if (relativePath.startsWith('../') || relativePath === '..') continue
      if (SENSITIVE_ENTRY.test(child.name) || SENSITIVE_DIRECTORIES.has(child.name.toLowerCase())) continue
      if (child.isSymbolicLink()) continue
      if (child.isDirectory()) {
        entries.push({ path: `${relativePath}/`, type: 'directory' })
        if (!IGNORED_DIRECTORIES.has(child.name.toLowerCase())) queue.push({ directory: childPath, depth: current.depth + 1 })
      } else if (child.isFile()) {
        try {
          const stat = await lstat(childPath)
          entries.push({ path: relativePath, type: 'file', sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() })
        } catch {
          // A disappearing file does not invalidate the remaining metadata inventory.
        }
      }
    }
  }
  if (queue.length > 0) truncated = true
  return { entries, truncated }
}
