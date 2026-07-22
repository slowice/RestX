import path from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = path.resolve('src')
const FEATURES_ROOT = path.join(SOURCE_ROOT, 'features')

describe('feature source boundaries', () => {
  it('does not import another feature internal implementation', async () => {
    const files = (await listSourceFiles(FEATURES_ROOT)).filter((file) => /\.(?:ts|tsx)$/.test(file))
    const violations: string[] = []

    for (const file of files) {
      const owner = featureName(file)
      const source = await readFile(file, 'utf8')
      for (const specifier of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
        if (!specifier[1].startsWith('.')) continue
        const target = path.resolve(path.dirname(file), specifier[1])
        if (!target.startsWith(FEATURES_ROOT + path.sep)) continue
        const targetOwner = featureName(target)
        if (targetOwner === owner || isPublicFeatureTarget(target, targetOwner)) continue
        violations.push(`${path.relative(SOURCE_ROOT, file)} -> ${specifier[1]}`)
      }
    }

    expect(violations).toEqual([])
  })

  it('keeps feature-specific code out of legacy central directories', async () => {
    const legacyFiles = [
      ...(await listSourceFiles(path.join(SOURCE_ROOT, 'main', 'services'))),
      ...(await listSourceFiles(path.join(SOURCE_ROOT, 'main', 'presets'))),
      ...(await listSourceFiles(path.join(SOURCE_ROOT, 'shared', 'contracts'))),
      ...(await listSourceFiles(path.join(SOURCE_ROOT, 'renderer', 'src', 'features')))
    ]
    expect(legacyFiles).toEqual([])
  })
})

function featureName(file: string): string {
  return path.relative(FEATURES_ROOT, file).split(path.sep)[0]
}

function isPublicFeatureTarget(target: string, owner: string): boolean {
  const root = path.join(FEATURES_ROOT, owner)
  return target.startsWith(path.join(root, 'shared') + path.sep)
    || target === path.join(root, 'renderer')
    || target === path.join(root, 'renderer', 'index')
}

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listSourceFiles(target))
    else files.push(target)
  }
  return files
}
