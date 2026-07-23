import { constants } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, readdir, readlink, rename, rmdir, symlink, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

export type RestxStorageLayout = {
  root: string
  config: string
  cache: string
  logs: string
  presets: string
  runtime: string
}

export function createRestxStorageLayout(homeDirectory = homedir()): RestxStorageLayout {
  const root = path.join(homeDirectory, '.restx')
  const config = path.join(root, 'config')
  return {
    root,
    config,
    cache: path.join(root, 'cache'),
    logs: path.join(root, 'logs'),
    presets: path.join(config, 'presets'),
    runtime: path.join(root, 'runtime')
  }
}

export function getRestxStorageLayout(): RestxStorageLayout {
  return createRestxStorageLayout()
}

async function statOrNull(filePath: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(filePath)
  } catch (reason) {
    if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'ENOENT') return null
    throw reason
  }
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700).catch(() => undefined)
}

async function normalizeLegacyRootCase(homeDirectory: string): Promise<void> {
  const legacyRoot = path.join(homeDirectory, '.RestX')
  const targetRoot = path.join(homeDirectory, '.restx')
  const [legacy, target] = await Promise.all([statOrNull(legacyRoot), statOrNull(targetRoot)])
  if (!legacy) return

  if (!target) {
    await rename(legacyRoot, targetRoot).catch(() => undefined)
    return
  }

  if (legacy.dev !== target.dev || legacy.ino !== target.ino) return
  const temporaryRoot = path.join(homeDirectory, `.restx-case-${process.pid}-${Date.now()}`)
  try {
    await rename(legacyRoot, temporaryRoot)
    await rename(temporaryRoot, targetRoot)
  } catch {
    await rename(temporaryRoot, legacyRoot).catch(() => undefined)
  }
}

async function moveEntryWithoutOverwrite(source: string, destination: string): Promise<boolean> {
  const sourceStat = await statOrNull(source)
  if (!sourceStat) return true
  const destinationStat = await statOrNull(destination)

  if (destinationStat) {
    if (!sourceStat.isDirectory() || !destinationStat.isDirectory()) return false
    for (const entry of await readdir(source)) {
      await moveEntryWithoutOverwrite(path.join(source, entry), path.join(destination, entry)).catch(() => false)
    }
    await rmdir(source).catch(() => undefined)
    return (await statOrNull(source)) === null
  }

  await ensurePrivateDirectory(path.dirname(destination))
  try {
    await rename(source, destination)
    return true
  } catch (reason) {
    if (!reason || typeof reason !== 'object' || !('code' in reason) || reason.code !== 'EXDEV') return false
  }

  try {
    if (sourceStat.isDirectory()) {
      await ensurePrivateDirectory(destination)
      for (const entry of await readdir(source)) {
        await moveEntryWithoutOverwrite(path.join(source, entry), path.join(destination, entry))
      }
      await rmdir(source)
    } else if (sourceStat.isSymbolicLink()) {
      await symlink(await readlink(source), destination)
      await unlink(source)
    } else {
      await copyFile(source, destination, constants.COPYFILE_EXCL)
      await unlink(source)
    }
    return true
  } catch {
    return false
  }
}

function classifyJsonFile(fileName: string, layout: RestxStorageLayout): string {
  return fileName.toLowerCase().includes('cache') ? layout.cache : layout.config
}

async function migrateLegacyRestxRoot(homeDirectory: string, layout: RestxStorageLayout): Promise<void> {
  const possibleRoots = [layout.root, path.join(homeDirectory, '.RestX')]
  for (const legacyRoot of possibleRoots) {
    const rootStat = await statOrNull(legacyRoot)
    if (!rootStat?.isDirectory()) continue
    await moveEntryWithoutOverwrite(path.join(legacyRoot, 'log'), layout.logs).catch(() => false)
    if (path.resolve(path.join(legacyRoot, 'logs')) !== path.resolve(layout.logs)) {
      await moveEntryWithoutOverwrite(path.join(legacyRoot, 'logs'), layout.logs).catch(() => false)
    }
    await moveEntryWithoutOverwrite(path.join(legacyRoot, 'presets'), layout.presets).catch(() => false)
    for (const entry of await readdir(legacyRoot).catch(() => [])) {
      if (!entry.toLowerCase().endsWith('.json')) continue
      await moveEntryWithoutOverwrite(path.join(legacyRoot, entry), path.join(classifyJsonFile(entry, layout), entry)).catch(() => false)
    }
    if (path.resolve(legacyRoot) !== path.resolve(layout.root)) await rmdir(legacyRoot).catch(() => undefined)
  }
}

async function pathsReferToSameEntry(left: string, right: string): Promise<boolean> {
  if (path.resolve(left) === path.resolve(right)) return true
  const [leftStat, rightStat] = await Promise.all([statOrNull(left), statOrNull(right)])
  return Boolean(leftStat && rightStat && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino)
}

async function migrateLegacyUserData(legacyUserData: string | undefined, layout: RestxStorageLayout): Promise<void> {
  if (!legacyUserData || await pathsReferToSameEntry(legacyUserData, layout.runtime)) return
  const sourceStat = await statOrNull(legacyUserData)
  if (!sourceStat?.isDirectory()) return

  const entries = await readdir(legacyUserData)
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.json')) continue
    await moveEntryWithoutOverwrite(
      path.join(legacyUserData, entry),
      path.join(classifyJsonFile(entry, layout), entry)
    ).catch(() => false)
  }
  for (const entry of await readdir(legacyUserData).catch(() => [])) {
    if (entry.toLowerCase().endsWith('.json')) continue
    await moveEntryWithoutOverwrite(path.join(legacyUserData, entry), path.join(layout.runtime, entry)).catch(() => false)
  }
  await rmdir(legacyUserData).catch(() => undefined)
}

export async function initializeRestxStorage(options: {
  homeDirectory?: string
  legacyUserData?: string
} = {}): Promise<RestxStorageLayout> {
  const homeDirectory = options.homeDirectory ?? homedir()
  const layout = createRestxStorageLayout(homeDirectory)
  await normalizeLegacyRootCase(homeDirectory).catch(() => undefined)
  await Promise.all([
    ensurePrivateDirectory(layout.root),
    ensurePrivateDirectory(layout.config),
    ensurePrivateDirectory(layout.cache),
    ensurePrivateDirectory(layout.logs),
    ensurePrivateDirectory(layout.presets),
    ensurePrivateDirectory(layout.runtime)
  ])
  await migrateLegacyRestxRoot(homeDirectory, layout)
  await migrateLegacyUserData(options.legacyUserData, layout)
  return layout
}
