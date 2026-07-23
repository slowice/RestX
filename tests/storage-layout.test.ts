import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRestxStorageLayout, initializeRestxStorage } from '../src/platform/main/storage'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'restx-storage-'))
  temporaryDirectories.push(directory)
  return directory
}

async function put(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, value, 'utf8')
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('RestX storage layout', () => {
  it('uses lifecycle-specific directories below the lowercase application root', () => {
    expect(createRestxStorageLayout('/Users/demo')).toEqual({
      root: '/Users/demo/.restx',
      config: '/Users/demo/.restx/config',
      cache: '/Users/demo/.restx/cache',
      logs: '/Users/demo/.restx/logs',
      presets: '/Users/demo/.restx/config/presets',
      runtime: '/Users/demo/.restx/runtime'
    })
  })

  it('migrates legacy files into their matching storage areas before use', async () => {
    const home = await temporaryDirectory()
    const userData = path.join(home, 'old-user-data')
    await put(path.join(home, '.RestX', 'log', 'ai-calls.jsonl'), 'log')
    await put(path.join(home, '.RestX', 'presets', 'team.json'), 'preset')
    await put(path.join(userData, 'preferences.json'), 'preferences')
    await put(path.join(userData, 'analysis-cache.json'), 'analysis')
    await put(path.join(userData, 'Network', 'Cookies'), 'runtime')

    const layout = await initializeRestxStorage({ homeDirectory: home, legacyUserData: userData })

    await expect(readFile(path.join(layout.logs, 'ai-calls.jsonl'), 'utf8')).resolves.toBe('log')
    await expect(readFile(path.join(layout.presets, 'team.json'), 'utf8')).resolves.toBe('preset')
    await expect(readFile(path.join(layout.config, 'preferences.json'), 'utf8')).resolves.toBe('preferences')
    await expect(readFile(path.join(layout.cache, 'analysis-cache.json'), 'utf8')).resolves.toBe('analysis')
    await expect(readFile(path.join(layout.runtime, 'Network', 'Cookies'), 'utf8')).resolves.toBe('runtime')
  })

  it('is idempotent and preserves a conflicting legacy source instead of overwriting', async () => {
    const home = await temporaryDirectory()
    const layout = createRestxStorageLayout(home)
    const userData = path.join(home, 'old-user-data')
    await put(path.join(layout.config, 'preferences.json'), 'current')
    await put(path.join(userData, 'preferences.json'), 'legacy')

    await initializeRestxStorage({ homeDirectory: home, legacyUserData: userData })
    await initializeRestxStorage({ homeDirectory: home, legacyUserData: userData })

    await expect(readFile(path.join(layout.config, 'preferences.json'), 'utf8')).resolves.toBe('current')
    await expect(readFile(path.join(userData, 'preferences.json'), 'utf8')).resolves.toBe('legacy')
  })
})
