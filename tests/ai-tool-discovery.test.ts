import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { discoverAiTools, validateAiToolPresets } from '../src/features/ai-inspector/main/services/ai-tool-discovery'
import type { AiToolPreset } from '../src/features/ai-inspector/main/presets/ai-tools'
import type { AiToolProbe } from '../src/features/ai-inspector/shared/contracts/ai-tool-preset'

const typeCheckedRelativeProbe = { relativePath: '.tool', entryType: 'directory' } satisfies AiToolProbe
const typeCheckedAbsoluteProbe = { path: '${HOME}/.tool', entryType: 'directory' } satisfies AiToolProbe
// @ts-expect-error AI tool probes must declare exactly one path field.
const typeRejectedBothPathProbe: AiToolProbe = { relativePath: '.tool', path: '${HOME}/.tool', entryType: 'directory' }
// @ts-expect-error AI tool probes must declare exactly one path field.
const typeRejectedMissingPathProbe: AiToolProbe = { entryType: 'directory' }

void typeCheckedRelativeProbe
void typeCheckedAbsoluteProbe
void typeRejectedBothPathProbe
void typeRejectedMissingPathProbe

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
    await writeFile(path.join(root, '.codex', 'sessions', 'session.jsonl'), [
      JSON.stringify({ timestamp: '2026-07-22T08:00:00Z', type: 'session_meta', payload: { id: 'session-42', cwd: '/Users/demo/RestX' } }),
      JSON.stringify({ timestamp: '2026-07-22T08:01:00Z', type: 'event_msg', payload: { type: 'user_message', message: '为什么模型调用超时？' } })
    ].join('\n'))

    const result = await discoverAiTools(root, limits)
    const codex = result.tools.find((tool) => tool.id === 'codex')

    expect(codex).toMatchObject({
      status: 'detected',
      counts: { config: 1, instruction: 1, log: 1 }
    })
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['config.toml', 'AGENTS.md', 'session.jsonl', 'latest.log'])
    expect(result.candidates.every((candidate) => candidate.toolId === 'codex')).toBe(true)
    expect(result.candidates.some((candidate) => candidate.name === 'auth.json')).toBe(false)
    expect(result.candidates.find((candidate) => candidate.name === 'session.jsonl')?.session).toEqual({
      sessionId: 'session-42', workspace: '/Users/demo/RestX', title: '为什么模型调用超时？', startedAt: '2026-07-22T08:00:00.000Z'
    })
    const conversationFolder = codex?.folders.find((folder) => folder.kind === 'conversation')
    expect(conversationFolder?.children).toHaveLength(1)
    expect(conversationFolder?.children[0]).toMatchObject({ name: 'RestX', path: '/Users/demo/RestX', role: 'physical' })
    expect(conversationFolder?.children[0].files[0].name).toBe('session.jsonl')
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
    expect(result.tools[0].folders.find((folder) => folder.kind === 'conversation')?.children[0]).toMatchObject({ name: '未知工作区', path: null })
  })

  it('rejects unsafe preset paths before scanning', () => {
    const unsafe: AiToolPreset = {
      id: 'unsafe', displayName: 'Unsafe', version: 1,
      probes: [{ relativePath: '/tmp/outside', entryType: 'directory' }],
      sources: [{ id: 'root', relativePath: '.unsafe', label: 'unsafe', maxDepth: 1, patterns: [{ glob: '*.json', kind: 'config', viewer: 'config', label: '配置' }] }]
    }
    expect(() => validateAiToolPresets([unsafe])).toThrow(/路径无效/)
  })

  it('accepts portable path fields and rejects unsafe portable path declarations', () => {
    const portable: AiToolPreset = {
      id: 'portable', displayName: 'Portable', version: 1,
      probes: [{ path: '${HOME}/.portable', entryType: 'directory' }],
      sources: [{
        id: 'logs', path: '${TEMP}/portable-*', platforms: ['darwin', 'win32'], label: 'Portable logs', maxDepth: 1,
        patterns: [{ glob: '*.log', kind: 'log', viewer: 'jsonl', jsonlProfileId: 'portable-log-v1', label: 'Logs' }]
      }],
      jsonlProfiles: [{
        id: 'portable-log-v1', timestampPaths: ['timestamp'], summaryPaths: ['message'],
        tagRules: [{ path: 'level', fallback: 'raw-value' }]
      }]
    }

    expect(() => validateAiToolPresets([portable])).not.toThrow()

    const withProbeFields = (fields: Record<string, unknown>): AiToolPreset => ({
      ...portable,
      probes: [{ entryType: 'directory', ...fields }]
    }) as AiToolPreset

    expect(() => validateAiToolPresets([withProbeFields({ relativePath: '.portable', path: '${HOME}/.portable' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({})])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ relativePath: '.portable-*' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${UNKNOWN}/.portable' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${HOME}/../escape' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${HOME}/wild*/portable' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${HOME}/portable/**/logs' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${HOME}/.portable', platforms: ['freebsd'] })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${HOME}\\credentials\\token.json' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${HOME}/auth/session.json' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${HOME}/secret/settings.json' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${HOME}/token.json' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${HOME}/cache/openclaw.json' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${HOME}/database/openclaw.db' })])).toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${UID}/.openclaw' })])).not.toThrow()
    expect(() => validateAiToolPresets([withProbeFields({ path: '${HOME}/.openclaw' })])).not.toThrow()
  })

  it('skips unresolved portable paths while discovery remains root-bound', async () => {
    const root = await makeFixture()
    await mkdir(path.join(root, '.local'))
    const preset: AiToolPreset = {
      id: 'portable-source', displayName: 'Portable Source', version: 1,
      probes: [{ relativePath: '.local', entryType: 'directory' }],
      sources: [{
        id: 'portable', path: '${UID}/.openclaw', label: 'Portable files', maxDepth: 1,
        patterns: [{ glob: '*.json', kind: 'config', viewer: 'config', label: 'Config' }]
      }]
    }

    const result = await discoverAiTools(root, limits, [preset])

    expect(result.tools[0]).toMatchObject({ id: 'portable-source', status: 'detected' })
    expect(result.candidates).toEqual([])
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
