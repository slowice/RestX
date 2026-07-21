import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AiToolPreset } from '../src/shared/contracts/ai-tool-preset'
import { UserPresetStore } from '../src/main/services/user-preset-store'

const temporaryDirectories: string[] = []

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'restx-presets-'))
  temporaryDirectories.push(directory)
  return directory
}

const novaPreset: AiToolPreset = {
  id: 'nova', displayName: 'Nova', version: 1,
  probes: [{ relativePath: '.nova', entryType: 'directory' }],
  sources: [{
    id: 'nova-home', relativePath: '.nova', label: '.nova', maxDepth: 2,
    patterns: [{ glob: 'config.json', kind: 'config', viewer: 'config', label: 'Nova 配置' }],
    excludes: ['auth.json', '**/*.db']
  }]
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('UserPresetStore', () => {
  it('loads JSON and YAML presets while isolating malformed files', async () => {
    const directory = await makeDirectory()
    await writeFile(path.join(directory, 'nova.json'), JSON.stringify(novaPreset))
    await writeFile(path.join(directory, 'orbit.yaml'), `id: orbit\ndisplayName: Orbit\nversion: 1\nprobes:\n  - relativePath: .orbit\n    entryType: directory\nsources:\n  - id: orbit-home\n    relativePath: .orbit\n    label: .orbit\n    maxDepth: 1\n    patterns:\n      - glob: settings.json\n        kind: config\n        viewer: config\n        label: Orbit config\n`)
    await writeFile(path.join(directory, 'broken.json'), '{not-json')

    const result = await new UserPresetStore(directory).load()

    expect(result.presets.map((preset) => preset.id)).toEqual(['nova', 'orbit'])
    expect(result.summaries.find((item) => item.id === 'broken')).toMatchObject({ valid: false, enabled: false })
  })

  it('atomically saves, disables, enables, and deletes a preset', async () => {
    const directory = await makeDirectory()
    const store = new UserPresetStore(directory)
    await store.save(novaPreset)
    expect(JSON.parse(await readFile(path.join(directory, 'nova.json'), 'utf8'))).toMatchObject({ id: 'nova' })
    expect((await readdir(directory)).some((name) => name.endsWith('.tmp'))).toBe(false)

    await store.setEnabled('nova', false)
    expect((await store.load()).presets).toHaveLength(0)
    await store.setEnabled('nova', true)
    expect((await store.load()).presets[0].id).toBe('nova')
    await store.delete('nova')
    expect((await store.load()).summaries).toHaveLength(0)
  })

  it('does not allow user data to override a built-in id', async () => {
    const directory = await makeDirectory()
    const store = new UserPresetStore(directory)
    await expect(store.save({ ...novaPreset, id: 'codex' })).rejects.toThrow(/\u5185置/)
  })
})
