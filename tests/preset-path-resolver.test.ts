import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resolvePresetPaths } from '../src/features/ai-inspector/main/services/preset-path-resolver'

const temporaryDirectories: string[] = []

async function makeFixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'restx-preset-paths-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('preset path resolver', () => {
  it('expands HOME and TEMP using the injected environment', async () => {
    const root = await makeFixture()
    const home = path.join(root, 'home')
    const temp = path.join(root, 'temp')
    await mkdir(path.join(home, '.openclaw'), { recursive: true })
    await mkdir(path.join(temp, 'openclaw-one'), { recursive: true })

    const environment = { homeDirectory: home, tempDirectory: temp, platform: 'darwin' as const }

    await expect(resolvePresetPaths(root, { path: '${HOME}/.openclaw' }, environment)).resolves.toEqual([path.join(home, '.openclaw')])
    await expect(resolvePresetPaths(root, { path: '${TEMP}/openclaw-*' }, environment)).resolves.toEqual([await realpath(path.join(temp, 'openclaw-one'))])
  })

  it('skips declarations that do not support the current platform', async () => {
    const root = await makeFixture()
    await expect(resolvePresetPaths(root, { path: '${HOME}/.openclaw', platforms: ['darwin'] }, {
      homeDirectory: root, tempDirectory: root, platform: 'win32'
    })).resolves.toEqual([])
  })

  it('expands UID only when it is available', async () => {
    const root = await makeFixture()
    const uid = path.join(root, '501')
    await mkdir(path.join(uid, '.openclaw'), { recursive: true })

    await expect(resolvePresetPaths(root, { path: '${UID}/.openclaw' }, {
      homeDirectory: root, tempDirectory: root, uid, platform: 'darwin'
    })).resolves.toEqual([path.join(uid, '.openclaw')])
    await expect(resolvePresetPaths(root, { path: '${UID}/.openclaw' }, {
      homeDirectory: root, tempDirectory: root, platform: 'darwin'
    })).resolves.toEqual([])
  })

  it('resolves terminal wildcards deterministically without symbolic links and caps results', async () => {
    const root = await makeFixture()
    const temp = path.join(root, 'temp')
    await mkdir(temp)
    await writeFile(path.join(temp, 'openclaw-z'), '')
    await symlink(path.join(temp, 'openclaw-z'), path.join(temp, 'openclaw-link'))
    await Promise.all(Array.from({ length: 33 }, (_, index) => writeFile(path.join(temp, `openclaw-${String(index).padStart(2, '0')}`), '')))

    const paths = await resolvePresetPaths(root, { path: '${TEMP}/openclaw-*' }, {
      homeDirectory: root, tempDirectory: temp, platform: 'darwin'
    })

    expect(paths).toHaveLength(32)
    expect(paths).toEqual([...paths].sort((left, right) => left.localeCompare(right)))
    expect(paths).not.toContain(path.join(temp, 'openclaw-link'))
  })

  it('matches terminal wildcards case-insensitively', async () => {
    const root = await makeFixture()
    const temp = path.join(root, 'temp')
    await mkdir(temp)
    await writeFile(path.join(temp, 'OpenClaw-log'), '')

    await expect(resolvePresetPaths(root, { path: '${TEMP}/openclaw-*' }, {
      homeDirectory: root, tempDirectory: temp, platform: 'darwin'
    })).resolves.toEqual([await realpath(path.join(temp, 'OpenClaw-log'))])
  })

  it('normalizes backslash portable templates before resolving terminal wildcards', async () => {
    const root = await makeFixture()
    const temp = path.join(root, 'temp')
    await mkdir(temp)
    await writeFile(path.join(temp, 'openclaw-log'), '')

    await expect(resolvePresetPaths(root, { path: '${TEMP}\\openclaw-*', platforms: ['win32'] }, {
      homeDirectory: root, tempDirectory: temp, platform: 'win32'
    })).resolves.toEqual([await realpath(path.join(temp, 'openclaw-log'))])
  })

  it('does not enumerate a terminal wildcard through a symbolic-link parent', async () => {
    const root = await makeFixture()
    const temp = path.join(root, 'temp')
    const external = path.join(root, 'external')
    await mkdir(external)
    await writeFile(path.join(external, 'openclaw-log'), '')
    await mkdir(temp)
    await symlink(external, path.join(temp, 'linked-parent'))

    await expect(resolvePresetPaths(root, { path: '${TEMP}/linked-parent/openclaw-*' }, {
      homeDirectory: root, tempDirectory: temp, platform: 'darwin'
    })).resolves.toEqual([])
  })

  it('resolves literal /tmp wildcard paths through the macOS tmp alias', async () => {
    const root = await makeFixture()
    const temp = await mkdtemp('/tmp/restx-literal-preset-paths-')
    temporaryDirectories.push(temp)
    await writeFile(path.join(temp, 'openclaw-log'), '')

    await expect(resolvePresetPaths(root, { path: `${temp}/openclaw-*` }, {
      homeDirectory: root, tempDirectory: root, platform: 'darwin'
    })).resolves.toEqual([await realpath(path.join(temp, 'openclaw-log'))])
  })

  it.skipIf(process.platform !== 'darwin')('rejects other literal first-component symbolic links', async () => {
    const root = await makeFixture()

    await expect(resolvePresetPaths(root, { path: '/etc/host*' }, {
      homeDirectory: root, tempDirectory: root, platform: 'darwin'
    })).resolves.toEqual([])
  })

  it('keeps exact relative paths inside the supplied root', async () => {
    const root = await makeFixture()
    await mkdir(path.join(root, '.openclaw'))
    await writeFile(path.join(root, '.openclaw-log'), '')

    await expect(resolvePresetPaths(root, { relativePath: '.openclaw' }, {
      homeDirectory: root, tempDirectory: root, platform: 'darwin'
    })).resolves.toEqual([path.join(root, '.openclaw')])
    await expect(resolvePresetPaths(root, { relativePath: '../outside' }, {
      homeDirectory: root, tempDirectory: root, platform: 'darwin'
    })).resolves.toEqual([])
    await expect(resolvePresetPaths(root, { relativePath: '.openclaw-*' }, {
      homeDirectory: root, tempDirectory: root, platform: 'darwin'
    })).resolves.toEqual([])
  })
})
