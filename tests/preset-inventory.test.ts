import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { collectPresetInventory } from '../src/features/ai-inspector/main/services/preset-inventory'

const temporaryDirectories: string[] = []
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))))

describe('preset metadata inventory', () => {
  it('returns paths and metadata without reading file content', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'restx-inventory-'))
    temporaryDirectories.push(root)
    await mkdir(path.join(root, '.nova', 'logs'), { recursive: true })
    await writeFile(path.join(root, '.nova', 'config.json'), 'UNIQUE_SECRET_CONTENT')
    await writeFile(path.join(root, '.nova', 'logs', 'run.log'), 'private log body')

    const inventory = await collectPresetInventory(root, 'Nova', '.nova')
    const serialized = JSON.stringify(inventory)

    expect(inventory.entries.some((entry) => entry.path === '.nova/config.json')).toBe(true)
    expect(serialized).not.toContain('UNIQUE_SECRET_CONTENT')
    expect(serialized).not.toContain('private log body')
  })

  it('caps inventories at 2,000 entries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'restx-inventory-'))
    temporaryDirectories.push(root)
    await Promise.all(Array.from({ length: 2_020 }, (_, index) => writeFile(path.join(root, `item-${index}.json`), '{}')))

    const inventory = await collectPresetInventory(root, 'Nova', '')
    expect(inventory.entries).toHaveLength(2_000)
    expect(inventory.truncated).toBe(true)
  })
})
