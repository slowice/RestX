import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { classifyCandidate, scanDirectory, sortScanCandidates } from '../src/features/ai-inspector/main/services/file-scanner'
import type { ScanCandidate } from '../src/features/ai-inspector/shared/contracts/inspector'
import { AI_TOOL_PRESETS, setRegisteredAiToolPresets } from '../src/features/ai-inspector/main/presets/ai-tools'
import type { AiToolPreset } from '../src/features/ai-inspector/main/presets/ai-tools'

vi.mock('../src/features/ai-inspector/main/services/user-preset-store', () => ({
  refreshAiToolPresetRegistry: vi.fn()
}))

const temporaryDirectories: string[] = []

async function makeFixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'restx-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  setRegisteredAiToolPresets(AI_TOOL_PRESETS)
})

describe('classifyCandidate', () => {
  it('recognizes configuration candidates with an explainable rule', () => {
    expect(classifyCandidate('settings.yaml', false)).toEqual({ kind: 'config', viewer: 'config', matchedBy: '文件名匹配 settings.*' })
    expect(classifyCandidate('.env', false)).toEqual({ kind: 'config', viewer: 'config', matchedBy: '环境配置文件 .env' })
  })

  it('prioritizes explicit log rules', () => {
    expect(classifyCandidate('assistant.log', false)).toEqual({ kind: 'log', viewer: 'metadata', matchedBy: '日志扩展名 .log' })
    expect(classifyCandidate('session.txt', true)).toEqual({ kind: 'log', viewer: 'metadata', matchedBy: '位于 logs 目录中的文本文件' })
  })
})

describe('sortScanCandidates', () => {
  it('puts explicit and tool-related configuration names before generic data files and logs', () => {
    const root = path.join(path.sep, 'workspace')
    const make = (name: string, kind: 'config' | 'log', directory = root): ScanCandidate => ({
      path: path.join(directory, name), name, kind, viewer: kind === 'config' ? 'config' : 'metadata', matchedBy: 'test', sizeBytes: 1, modifiedAt: '2026-07-21T00:00:00.000Z'
    })
    const candidates = [
      make('a-data.json', 'config'),
      make('runtime.log', 'log'),
      make('mcp.json', 'config'),
      make('settings.yaml', 'config'),
      make('config.toml', 'config'),
      make('.env', 'config'),
      make('claude.json', 'config', path.join(root, 'nested'))
    ]
    sortScanCandidates(candidates, root)
    expect(candidates.map((item) => item.name)).toEqual([
      '.env', 'config.toml', 'settings.yaml', 'mcp.json', 'claude.json', 'a-data.json', 'runtime.log'
    ])
  })
})

describe('scanDirectory', () => {
  it('scans metadata, groups candidates and ignores build directories', async () => {
    const root = await makeFixture()
    await mkdir(path.join(root, 'logs'))
    await mkdir(path.join(root, 'node_modules'))
    await writeFile(path.join(root, 'config.json'), '{"secret":"not read"}')
    await writeFile(path.join(root, 'logs', 'latest.txt'), 'hello')
    await writeFile(path.join(root, 'notes.md'), 'ordinary')
    await writeFile(path.join(root, 'node_modules', 'settings.json'), '{}')

    const result = await scanDirectory(root)

    expect(result.scannedFileCount).toBe(3)
    expect(result.candidates.map((candidate) => [candidate.name, candidate.kind])).toEqual([
      ['config.json', 'config'],
      ['latest.txt', 'log']
    ])
    expect(result.skipped.some((entry) => entry.path.endsWith('node_modules'))).toBe(true)
  })

  it('rejects a path that is not a directory', async () => {
    const root = await makeFixture()
    const file = path.join(root, 'config.json')
    await writeFile(file, '{}')
    await expect(scanDirectory(file)).rejects.toMatchObject({ code: 'NOT_DIRECTORY' })
  })

  it('stops at the configured file limit', async () => {
    const root = await makeFixture()
    await Promise.all(Array.from({ length: 6 }, (_, index) => writeFile(path.join(root, `${index}.txt`), 'x')))
    const result = await scanDirectory(root, { maxFiles: 3 })
    expect(result.scannedFileCount).toBe(3)
    expect(result.skipped.some((entry) => entry.reason.includes('扫描上限'))).toBe(true)
  })

  it('uses detected tool presets instead of polluting a home scan with unrelated files', async () => {
    const root = await makeFixture()
    await mkdir(path.join(root, '.claude'))
    await mkdir(path.join(root, 'documents'))
    await writeFile(path.join(root, '.claude', 'settings.json'), '{}')
    await writeFile(path.join(root, 'documents', 'random.json'), '{}')

    const result = await scanDirectory(root)

    expect(result.tools.find((tool) => tool.id === 'claude-code')).toMatchObject({ status: 'detected' })
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['settings.json'])
  })

  it('authorizes each detected external source root before returning the scan result', async () => {
    const root = await makeFixture()
    const externalHome = await makeFixture()
    const externalSource = path.join(externalHome, 'nova-run')
    await mkdir(path.join(externalHome, '.nova'))
    await mkdir(externalSource)
    await writeFile(path.join(externalSource, 'gateway.log'), 'started')
    const preset: AiToolPreset = {
      id: 'external-nova', displayName: 'External Nova', version: 1,
      probes: [{ path: '${HOME}/.nova', entryType: 'directory' }],
      sources: [{
        id: 'logs', path: '${TEMP}/nova-*', label: 'Nova logs', maxDepth: 1,
        patterns: [{ glob: '*.log', kind: 'log', viewer: 'metadata', label: 'Log' }]
      }]
    }
    setRegisteredAiToolPresets([preset])
    const authorized: string[] = []

    const result = await scanDirectory(root, {}, {
      pathEnvironment: { homeDirectory: externalHome, tempDirectory: externalHome, platform: process.platform },
      authorizeRoot: async (directory) => { authorized.push(directory) }
    })

    expect(authorized).toEqual([await realpath(externalSource)])
    expect(result.candidates).toMatchObject([{ name: 'gateway.log', kind: 'log' }])
  })
})
