import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { discoverAiTools, validateAiToolPresets } from '../src/main/services/ai-tool-discovery'
import type { AiToolPreset } from '../src/main/presets/ai-tools'

const temporaryDirectories: string[] = []

async function makeFixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'restx-tools-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const limits = { maxFiles: 1_000, maxFileSizeBytes: 1024 * 1024 }

describe('AI tool discovery framework', () => {
  it('detects Codex and groups only preset-owned safe files', async () => {
    const root = await makeFixture()
    await mkdir(path.join(root, '.codex', 'logs'), { recursive: true })
    await mkdir(path.join(root, '.codex', 'sessions'), { recursive: true })
    await writeFile(path.join(root, '.codex', 'config.toml'), 'model = "demo"')
    await writeFile(path.join(root, '.codex', 'AGENTS.md'), 'Be helpful')
    await writeFile(path.join(root, '.codex', 'logs', 'latest.log'), 'started')
    await writeFile(path.join(root, '.codex', 'auth.json'), '{"token":"secret"}')
    await writeFile(path.join(root, '.codex', 'sessions', 'session.jsonl'), '{}')

    const result = await discoverAiTools(root, limits)
    const codex = result.tools.find((tool) => tool.id === 'codex')

    expect(codex).toMatchObject({
      status: 'detected',
      counts: { config: 1, instruction: 1, log: 1 }
    })
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['config.toml', 'AGENTS.md', 'session.jsonl', 'latest.log'])
    expect(result.candidates.every((candidate) => candidate.toolId === 'codex')).toBe(true)
    expect(result.candidates.some((candidate) => candidate.name === 'auth.json')).toBe(false)
  })

  it('accepts a synthetic fourth tool without changing discovery code', async () => {
    const root = await makeFixture()
    await mkdir(path.join(root, '.nova'))
    await writeFile(path.join(root, '.nova', 'nova.yaml'), 'enabled: true')
    await writeFile(path.join(root, '.nova', 'session.jsonl'), '{"kind":"thought"}\n')
    const novaPreset: AiToolPreset = {
      id: 'nova', displayName: 'Nova', version: 1,
      probes: [{ relativePath: '.nova', entryType: 'directory' }],
      sources: [{
        id: 'nova-home', relativePath: '.nova', label: '.nova', maxDepth: 1,
        patterns: [
          { glob: '*.yaml', kind: 'config', viewer: 'config', label: 'Nova 配置' },
          { glob: '*.jsonl', kind: 'conversation', viewer: 'jsonl', jsonlProfileId: 'nova-events-v1', label: 'Nova 会话' }
        ]
      }],
      jsonlProfiles: [{
        id: 'nova-events-v1', timestampPaths: [],
        tagRules: [{ path: 'kind', values: { thought: { label: '思考', tone: 'thinking' } } }]
      }]
    }

    const result = await discoverAiTools(root, limits, [novaPreset])

    expect(result.tools[0]).toMatchObject({ id: 'nova', displayName: 'Nova', status: 'detected' })
    expect(result.candidates[0]).toMatchObject({ name: 'nova.yaml', toolId: 'nova', kind: 'config' })
    expect(result.candidates[1]).toMatchObject({ name: 'session.jsonl', toolId: 'nova', kind: 'conversation', viewer: 'jsonl', jsonlProfileId: 'nova-events-v1' })
  })

  it('rejects unsafe preset paths before scanning', () => {
    const unsafe: AiToolPreset = {
      id: 'unsafe', displayName: 'Unsafe', version: 1,
      probes: [{ relativePath: '/tmp/outside', entryType: 'directory' }],
      sources: [{ id: 'root', relativePath: '.unsafe', label: 'unsafe', maxDepth: 1, patterns: [{ glob: '*.json', kind: 'config', viewer: 'config', label: '配置' }] }]
    }
    expect(() => validateAiToolPresets([unsafe])).toThrow(/路径无效/)
  })

  it('rejects executable callbacks in a declarative preset', () => {
    const preset = {
      id: 'callback-tool', displayName: 'Callback Tool', version: 1,
      probes: [{ relativePath: '.callback-tool', entryType: 'directory' }],
      sources: [{ id: 'home', relativePath: '.callback-tool', label: 'home', maxDepth: 1, patterns: [{ glob: '*.json', kind: 'config', label: '配置' }] }],
      run: () => undefined
    }
    expect(() => validateAiToolPresets([preset as unknown as AiToolPreset])).toThrow(/声明式数据/)
  })
})
