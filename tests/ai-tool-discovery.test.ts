import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { discoverAiTools, validateAiToolPresets } from '../src/features/ai-inspector/main/services/ai-tool-discovery'
import { AI_TOOL_PRESETS, type AiToolPreset } from '../src/features/ai-inspector/main/presets/ai-tools'
import { openClawPreset } from '../src/features/ai-inspector/main/presets/ai-tools/openclaw'
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
const originalBuiltInPresets = [...AI_TOOL_PRESETS]

function addBuiltInPreset(preset: AiToolPreset): void {
  (AI_TOOL_PRESETS as AiToolPreset[]).push(preset)
}

async function makeFixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'restx-tools-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  ;(AI_TOOL_PRESETS as AiToolPreset[]).splice(0, AI_TOOL_PRESETS.length, ...originalBuiltInPresets)
})

const limits = { maxFiles: 1_000, maxFileSizeBytes: 1024 * 1024 }

describe('AI tool discovery framework', () => {
  it('excludes sensitive OpenClaw collisions and scans overlapping macOS TEMP and launchd roots once', async () => {
    const root = await makeFixture()
    const home = await makeFixture()
    const temp = await makeFixture()
    const stateDirectory = path.join(home, '.openclaw')
    const workspace = path.join(stateDirectory, 'workspace')
    const sessionDirectory = path.join(stateDirectory, 'agents', 'main', 'sessions')
    const macosDefaultLogDirectory = path.join(temp, 'openclaw')
    const gatewayLogDirectory = path.join(temp, 'openclaw-user123')
    const launchdLogDirectory = path.join(home, 'Library', 'Logs', 'openclaw')
    const controlledPreset = structuredClone(openClawPreset)
    const macosDefaultSource = controlledPreset.sources.find((source) => source.id === 'openclaw-macos-default-logs')
    if (!macosDefaultSource) throw new Error('OpenClaw macOS default source is missing')
    macosDefaultSource.path = macosDefaultLogDirectory
    addBuiltInPreset(controlledPreset)
    await Promise.all([
      mkdir(path.join(workspace, 'memory'), { recursive: true }),
      mkdir(sessionDirectory, { recursive: true }),
      mkdir(path.join(stateDirectory, 'agents', 'main', 'agent'), { recursive: true }),
      mkdir(path.join(stateDirectory, 'credentials'), { recursive: true }),
      mkdir(gatewayLogDirectory, { recursive: true }),
      mkdir(macosDefaultLogDirectory, { recursive: true }),
      mkdir(launchdLogDirectory, { recursive: true })
    ])
    await Promise.all([
      writeFile(path.join(stateDirectory, 'openclaw.json'), '{"gateway":{"mode":"local"}}'),
      writeFile(path.join(workspace, 'AGENTS.md'), 'Follow the project instructions.'),
      writeFile(path.join(workspace, 'SOUL.md'), 'Be useful.'),
      writeFile(path.join(workspace, 'memory', '2026-07-23.md'), 'Remember the release checklist.'),
      writeFile(path.join(sessionDirectory, 'session-1.jsonl'), [
        JSON.stringify({ type: 'session', id: 'session-1', timestamp: '2026-07-23T08:00:00Z', cwd: '/Users/demo/RestX' }),
        JSON.stringify({ type: 'message', timestamp: '2026-07-23T08:01:00Z', message: { role: 'user', content: [{ type: 'text', text: '检查 Gateway 状态' }] } })
      ].join('\n')),
      ...['auth', 'credentials', 'secret', 'token', 'sandbox', 'media', 'cache'].map((name) =>
        writeFile(path.join(sessionDirectory, `${name}.jsonl`), JSON.stringify({ type: 'session', id: `sensitive-${name}` }))
      ),
      writeFile(path.join(stateDirectory, 'agents', 'main', 'agent', 'auth-profiles.json'), '{"token":"secret"}'),
      writeFile(path.join(stateDirectory, 'credentials', 'channel.json'), '{"token":"secret"}'),
      writeFile(path.join(macosDefaultLogDirectory, 'default.log'), '{"message":"default"}'),
      writeFile(path.join(gatewayLogDirectory, 'temp.log'), JSON.stringify({
        time: '2026-07-23T08:02:00Z', level: 'info', subsystem: 'gateway', message: 'Gateway started'
      })),
      writeFile(path.join(launchdLogDirectory, 'launchd.log'), '{"message":"launchd"}')
    ])
    for (const logDirectory of [macosDefaultLogDirectory, gatewayLogDirectory, launchdLogDirectory]) {
      await Promise.all([
        mkdir(path.join(logDirectory, 'credentials'), { recursive: true }),
        mkdir(path.join(logDirectory, 'secrets'), { recursive: true }),
        mkdir(path.join(logDirectory, 'sandboxes'), { recursive: true }),
        mkdir(path.join(logDirectory, 'media'), { recursive: true }),
        mkdir(path.join(logDirectory, 'cache'), { recursive: true })
      ])
      await Promise.all([
        writeFile(path.join(logDirectory, 'credentials', 'gateway.log'), '{"message":"credential"}'),
        writeFile(path.join(logDirectory, 'auth.log'), '{"message":"auth"}'),
        writeFile(path.join(logDirectory, 'secrets', 'token.log'), '{"message":"token"}'),
        writeFile(path.join(logDirectory, 'sandboxes', 'session.log'), '{"message":"sandbox"}'),
        writeFile(path.join(logDirectory, 'media', 'output.log'), '{"message":"media"}'),
        writeFile(path.join(logDirectory, 'cache', 'cached.log'), '{"message":"cache"}')
      ])
    }

    const result = await discoverAiTools(root, limits, [controlledPreset], {
      homeDirectory: home,
      tempDirectory: temp,
      platform: 'darwin'
    })
    const openClaw = result.tools.find((tool) => tool.id === 'openclaw')
    const openClawCandidates = result.candidates.filter((candidate) => candidate.toolId === 'openclaw')

    expect(openClaw).toMatchObject({
      status: 'detected',
      counts: { config: 1, instruction: 3, conversation: 1, log: 3 }
    })
    expect(result.scannedFileCount).toBe(8)
    expect(openClawCandidates).toHaveLength(8)
    expect(openClawCandidates.map((candidate) => candidate.path).join('\n')).not.toMatch(
      /(?:auth|credentials|secret|token|sandbox|media|cache)/i
    )
    expect(openClawCandidates.find((candidate) => candidate.name === 'session-1.jsonl')).toMatchObject({
      jsonlProfileId: 'openclaw-session-v1',
      session: {
        sessionId: 'session-1',
        workspace: '/Users/demo/RestX',
        title: '检查 Gateway 状态',
        startedAt: '2026-07-23T08:00:00.000Z'
      }
    })
    expect(openClawCandidates.find((candidate) => candidate.name === 'temp.log')).toMatchObject({
      kind: 'log',
      viewer: 'jsonl',
      jsonlProfileId: 'openclaw-gateway-log-v1'
    })
  })

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

    const result = await discoverAiTools(root, limits, AI_TOOL_PRESETS, {
      homeDirectory: root,
      tempDirectory: root,
      platform: process.platform
    })
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
    expect(result.authorizationRoots).toEqual([])
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

    const withProfileExtensions = (fileExtensions: unknown): AiToolPreset => ({
      ...portable,
      jsonlProfiles: portable.jsonlProfiles?.map((profile) => ({ ...profile, fileExtensions }))
    }) as unknown as AiToolPreset

    expect(() => validateAiToolPresets([withProfileExtensions(['.log'])])).not.toThrow()
    expect(() => validateAiToolPresets([withProfileExtensions([])])).toThrow()
    expect(() => validateAiToolPresets([withProfileExtensions(['.log', '.log'])])).toThrow()
    expect(() => validateAiToolPresets([withProfileExtensions(['log'])])).toThrow()
    expect(() => validateAiToolPresets([withProfileExtensions(['.LOG'])])).toThrow()
    expect(() => validateAiToolPresets([withProfileExtensions(Array.from({ length: 9 }, (_, index) => `.log${index}`))])).toThrow()

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

  it('does not resolve or authorize portable paths from an untrusted preset', async () => {
    const root = await makeFixture()
    const externalHome = await makeFixture()
    const externalSource = path.join(externalHome, 'nova-run')
    await mkdir(path.join(externalHome, '.nova'))
    await mkdir(externalSource)
    await writeFile(path.join(externalSource, 'gateway.log'), 'started')
    const environment = {
      homeDirectory: externalHome,
      tempDirectory: externalHome,
      platform: process.platform
    }
    const detectedPreset: AiToolPreset = {
      id: 'portable-source', displayName: 'Portable Source', version: 1,
      probes: [{ path: '${HOME}/.nova', entryType: 'directory' }],
      sources: [{
        id: 'portable', path: '${TEMP}/nova-*', label: 'Portable files', maxDepth: 1,
        patterns: [{ glob: '*.log', kind: 'log', viewer: 'metadata', label: 'Log' }]
      }]
    }
    const result = await discoverAiTools(root, limits, [detectedPreset], environment)

    expect(result.tools[0]).toMatchObject({ id: 'portable-source', status: 'not-detected' })
    expect(result.candidates).toEqual([])
    expect(result.authorizationRoots).toEqual([])
  })

  it('discovers every trusted resolved source root using source-relative match rules', async () => {
    const root = await makeFixture()
    const externalHome = await makeFixture()
    const firstSource = path.join(externalHome, 'nova-one')
    const secondSource = path.join(externalHome, 'nova-two')
    await mkdir(path.join(externalHome, '.nova'))
    await mkdir(firstSource)
    await mkdir(secondSource)
    await writeFile(path.join(firstSource, 'first.log'), 'one')
    await writeFile(path.join(secondSource, 'second.log'), 'two')
    const preset: AiToolPreset = {
      id: 'trusted-nova', displayName: 'Trusted Nova', version: 1,
      probes: [{ path: '${HOME}/.nova', entryType: 'directory' }],
      sources: [{
        id: 'logs', path: '${TEMP}/nova-*', label: 'Nova logs', maxDepth: 1,
        patterns: [{ glob: '*.log', kind: 'log', viewer: 'metadata', label: 'Log' }]
      }]
    }
    addBuiltInPreset(preset)

    const result = await discoverAiTools(root, limits, [preset], {
      homeDirectory: externalHome, tempDirectory: externalHome, platform: process.platform
    })

    expect(result.candidates.map((candidate) => candidate.name).sort()).toEqual(['first.log', 'second.log'])
    expect(result.authorizationRoots).toEqual([await realpath(firstSource), await realpath(secondSource)])
  })

  it('authorizes the real parent directory for a trusted file source', async () => {
    const root = await makeFixture()
    const externalHome = await makeFixture()
    const sourceFile = path.join(externalHome, 'nova.log')
    await mkdir(path.join(externalHome, '.nova'))
    await writeFile(sourceFile, 'started')
    const preset: AiToolPreset = {
      id: 'trusted-nova-file', displayName: 'Trusted Nova File', version: 1,
      probes: [{ path: '${HOME}/.nova', entryType: 'directory' }],
      sources: [{
        id: 'log', path: '${TEMP}/nova.log', label: 'Nova log', maxDepth: 0,
        patterns: [{ glob: 'nova.log', kind: 'log', viewer: 'metadata', label: 'Log' }]
      }]
    }
    addBuiltInPreset(preset)

    const result = await discoverAiTools(root, limits, [preset], {
      homeDirectory: externalHome, tempDirectory: externalHome, platform: process.platform
    })

    expect(result.authorizationRoots).toEqual([await realpath(externalHome)])
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
