// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { RestXApi } from '../src/app-api'
import type { AiProviderPublicSettings, CachedAnalysisResponse, RuntimeStatus } from '../src/features/ai-inspector/shared/contracts/ai-capability'
import type { ConfigDocument } from '../src/features/ai-inspector/shared/contracts/config'
import type { ScanCandidate, ScanResult } from '../src/features/ai-inspector/shared/contracts/inspector'
import type { JsonlEntryDetail, JsonlPage } from '../src/features/ai-inspector/shared/contracts/jsonl'
import type { SmartPresetDraft, UserPresetSummary } from '../src/features/ai-inspector/shared/contracts/smart-import'
import { InspectorStateProvider } from '../src/features/ai-inspector/renderer/state/InspectorState'
import { InspectorPage } from '../src/features/ai-inspector/renderer/pages/InspectorPage'

const configCandidate: ScanCandidate = {
  path: '/Users/demo/.codex/config.toml',
  name: 'config.toml',
  kind: 'config',
  viewer: 'config',
  matchedBy: 'Codex 预置 · Codex 配置',
  sizeBytes: 42,
  modifiedAt: '2026-07-21T08:00:00.000Z',
  toolId: 'codex',
  sourceId: 'codex-home',
  relativePath: '.codex/config.toml'
}

const result: ScanResult = {
  rootPath: '/Users/demo',
  startedAt: '2026-07-21T08:00:00.000Z',
  completedAt: '2026-07-21T08:00:01.000Z',
  scannedFileCount: 4,
  candidates: [configCandidate],
  skipped: [],
  tools: [
    {
      id: 'codex', displayName: 'Codex', status: 'detected',
      evidence: [{ path: '/Users/demo/.codex', entryType: 'directory' }],
      counts: { config: 1, instruction: 0, conversation: 0, history: 0, log: 0 },
      folders: [{
        id: 'config', name: '配置', path: null, role: 'category', kind: 'config',
        counts: { config: 1, instruction: 0, conversation: 0, history: 0, log: 0 }, children: [], files: [configCandidate]
      }]
    },
    { id: 'claude-code', displayName: 'Claude Code', status: 'not-detected', evidence: [], counts: { config: 0, instruction: 0, conversation: 0, history: 0, log: 0 }, folders: [] },
    { id: 'opencode', displayName: 'OpenCode', status: 'not-detected', evidence: [], counts: { config: 0, instruction: 0, conversation: 0, history: 0, log: 0 }, folders: [] }
  ]
}

const document: ConfigDocument = {
  path: configCandidate.path,
  name: configCandidate.name,
  format: 'toml',
  sizeBytes: 42,
  modifiedAt: configCandidate.modifiedAt,
  sourceHash: 'a'.repeat(64),
  redactedText: 'model = "demo"',
  data: { model: 'demo' },
  parseError: null,
  redactionCount: 0
}

function makeApi(): RestXApi {
  return {
    inspector: {
      chooseDirectory: vi.fn(async () => '/Users/demo'),
      scanDirectory: vi.fn(async () => result),
      readConfig: vi.fn(async () => document),
      readJsonlPage: vi.fn(),
      readJsonlEntry: vi.fn(),
      revealInFolder: vi.fn(async () => undefined)
    },
    app: {
      getVersion: vi.fn(async () => '0.1.0'),
      getPreferences: vi.fn(async () => ({ recentDirectory: '/Users/demo', aiLocalAnalysisEnabled: false })),
      setAiLocalAnalysisEnabled: vi.fn(), clearHistory: vi.fn()
    },
    ai: {
      getRuntimeStatus: vi.fn(async (): Promise<RuntimeStatus> => 'ready'),
      getProviderSettings: vi.fn(async (): Promise<AiProviderPublicSettings> => ({ provider: 'openai-compatible', baseUrl: '', model: '', apiKeyConfigured: false })),
      updateProviderSettings: vi.fn(), analyzeConfig: vi.fn(), getCachedAnalysis: vi.fn(async (): Promise<CachedAnalysisResponse> => ({ status: 'none', record: null })), clearAnalysisCache: vi.fn()
    },
    presets: { list: vi.fn(async () => []), generateDraft: vi.fn(), save: vi.fn(), setEnabled: vi.fn(), delete: vi.fn() },
    codeReview: { listMyGitCodeMergeRequests: vi.fn(), previewSource: vi.fn(), run: vi.fn(), getGitCodeSettings: vi.fn(), updateGitCodeSettings: vi.fn(), testGitCodeConnection: vi.fn(), getZoneProviders: vi.fn(), updateZoneProvider: vi.fn(), clearCache: vi.fn() }
  }
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('Inspector tool folder browser', () => {
  it('shows detected tools, opens a category folder, and reuses config detail', async () => {
    const api = makeApi()
    Object.defineProperty(window, 'restx', { configurable: true, value: api })
    render(<MemoryRouter><InspectorStateProvider><InspectorPage /></InspectorStateProvider></MemoryRouter>)

    fireEvent.click(screen.getAllByRole('button', { name: /选择用户目录/ })[0])

    await waitFor(() => expect(screen.getByText('1 / 3 已检测到')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Claude Code.*未发现/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /配置.*模型、服务和权限等配置/ }))
    expect(screen.getByText('config.toml')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看' }))
    await waitFor(() => expect(screen.getByText('demo')).toBeInTheDocument())
    expect(api.inspector.readConfig).toHaveBeenCalledWith(configCandidate.path)
  })

  it('opens JSONL conversations as tagged rows and formats a selected event', async () => {
    const jsonlCandidate: ScanCandidate = {
      path: '/Users/demo/.codex/sessions/demo.jsonl', name: 'demo.jsonl', kind: 'conversation', viewer: 'jsonl',
      jsonlProfileId: 'codex-events-v1', matchedBy: 'Codex 预置 · Codex 当前会话', sizeBytes: 120,
      modifiedAt: '2026-07-21T09:00:00.000Z', toolId: 'codex', sourceId: 'codex-home', relativePath: '.codex/sessions/demo.jsonl'
    }
    const jsonlResult: ScanResult = {
      ...result, candidates: [jsonlCandidate],
      tools: result.tools.map((tool) => tool.id === 'codex' ? {
        ...tool,
        counts: { config: 0, instruction: 0, conversation: 1, history: 0, log: 0 },
        folders: [{
          id: 'conversation', name: '会话记录', path: null, role: 'category', kind: 'conversation',
          counts: { config: 0, instruction: 0, conversation: 1, history: 0, log: 0 }, children: [], files: [jsonlCandidate]
        }]
      } : tool)
    }
    const api = makeApi()
    api.inspector.scanDirectory = vi.fn(async () => jsonlResult)
    api.inspector.readJsonlPage = vi.fn(async (): Promise<JsonlPage> => ({
      file: { path: jsonlCandidate.path, name: jsonlCandidate.name, sizeBytes: 120, modifiedAt: jsonlCandidate.modifiedAt, snapshotId: '120:1:1' },
      entries: [{ offset: '0', byteLength: 50, rawPreview: '{"payload":{"type":"reasoning"}}', timestamp: '2026-07-21T09:00:00.000Z', tags: [{ label: '思考', tone: 'thinking' }], parseStatus: 'valid' }],
      olderCursor: null, changed: false
    }))
    api.inspector.readJsonlEntry = vi.fn(async (): Promise<JsonlEntryDetail> => ({
      offset: '0', raw: '{"payload":{"type":"reasoning"}}', formatted: '{\n  "payload": {\n    "type": "reasoning"\n  }\n}',
      tags: [{ label: '思考', tone: 'thinking' }], parseError: null, truncated: false
    }))
    Object.defineProperty(window, 'restx', { configurable: true, value: api })
    render(<MemoryRouter><InspectorStateProvider><InspectorPage /></InspectorStateProvider></MemoryRouter>)

    fireEvent.click(screen.getAllByRole('button', { name: /选择用户目录/ })[0])
    await waitFor(() => expect(screen.getByRole('button', { name: /会话记录.*对话、思考与工具调用记录/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /会话记录.*对话、思考与工具调用记录/ }))
    fireEvent.click(screen.getByRole('button', { name: '浏览记录' }))
    await waitFor(() => expect(screen.getByText('{"payload":{"type":"reasoning"}}')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /思考.*payload/ }))
    await waitFor(() => expect(api.inspector.readJsonlEntry).toHaveBeenCalled())
    expect(screen.getByText(/"type": "reasoning"/)).toBeInTheDocument()
  })

  it('generates, previews, and confirms a smart imported preset', async () => {
    const api = makeApi()
    const preset = {
      id: 'nova', displayName: 'Nova', version: 1,
      probes: [{ relativePath: '.nova', entryType: 'directory' as const }],
      sources: [{ id: 'nova-home', relativePath: '.nova', label: '.nova', maxDepth: 2, patterns: [{ glob: 'config.json', kind: 'config' as const, viewer: 'config' as const, label: 'Nova 配置' }] }]
    }
    const draft: SmartPresetDraft = {
      preset, explanation: '根据 .nova 目录生成。', warnings: [],
      inventory: { rootPath: '/Users/demo', entryCount: 12, truncated: false },
      trial: {
        detected: true,
        tool: {
          id: 'nova', displayName: 'Nova', status: 'detected', evidence: [{ path: '/Users/demo/.nova', entryType: 'directory' }],
          counts: { config: 1, instruction: 0, conversation: 0, history: 0, log: 0 }, folders: []
        },
        candidates: [{ ...configCandidate, path: '/Users/demo/.nova/config.json', name: 'config.json', toolId: 'nova' }]
      }
    }
    api.presets.generateDraft = vi.fn(async () => draft)
    api.presets.save = vi.fn(async (): Promise<UserPresetSummary> => ({ id: 'nova', displayName: 'Nova', enabled: true, valid: true, format: 'json', filePath: '/Users/demo/.RestX/presets/nova.json', error: null }))
    Object.defineProperty(window, 'restx', { configurable: true, value: api })
    render(<MemoryRouter><InspectorStateProvider><InspectorPage /></InspectorStateProvider></MemoryRouter>)

    fireEvent.click(screen.getAllByRole('button', { name: /选择用户目录/ })[0])
    await waitFor(() => expect(screen.getByText('1 / 3 已检测到')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '智能导入' }))
    fireEvent.change(screen.getByPlaceholderText('例如 Gemini CLI、Aider'), { target: { value: 'Nova' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '生成导入方案' }))

    await waitFor(() => expect(screen.getByText('试扫描已检测到该工具')).toBeInTheDocument())
    expect(screen.getByText('根据 .nova 目录生成。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认导入并扫描' }))
    await waitFor(() => expect(api.presets.save).toHaveBeenCalledWith({ preset }))
  })
})
