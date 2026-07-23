// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { RestXApi } from '../src/app-api'
import type { CachedAnalysisResponse } from '../src/features/ai-inspector/shared/contracts/ai-capability'
import type { ConfigDocument } from '../src/features/ai-inspector/shared/contracts/config'
import { InspectorStateProvider } from '../src/features/ai-inspector/renderer/state/InspectorState'
import { ConfigDetail } from '../src/features/ai-inspector/renderer/components/ConfigDetail'

const document: ConfigDocument = {
  path: '/authorized/config.json', name: 'config.json', format: 'json', sizeBytes: 40,
  modifiedAt: '2026-07-21T00:00:00.000Z', sourceHash: 'a'.repeat(64),
  redactedText: '{\n  "apiKey": "[REDACTED]",\n  "model": "demo"\n}',
  data: { apiKey: '[REDACTED]', model: 'demo', nested: { enabled: true } },
  parseError: null, redactionCount: 1
}

function makeApi(consent: boolean): RestXApi {
  return {
    inspector: {
      chooseDirectory: vi.fn(), scanDirectory: vi.fn(), readConfig: vi.fn(), readJsonlPage: vi.fn(), readJsonlEntry: vi.fn(), searchJsonlWorkspace: vi.fn(), revealInFolder: vi.fn()
    },
    app: {
      getVersion: vi.fn(async () => '0.1.0'),
      getPreferences: vi.fn(async () => ({ recentDirectory: '/authorized', aiLocalAnalysisEnabled: consent })),
      setAiLocalAnalysisEnabled: vi.fn(), clearHistory: vi.fn()
    },
    providers: {
      getState: vi.fn(async () => ({ activeProviderId: 'demo', providers: [{ id: 'demo', name: 'Demo', source: 'manual' as const, baseUrl: 'https://example.com/v1', modelId: 'demo', apiKeyConfigured: true, status: 'ready' as const, active: true, editable: true, identityFingerprint: 'identity' }] })),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), setActive: vi.fn(), test: vi.fn(), refreshExternal: vi.fn()
    },
    ai: {
      analyzeConfig: vi.fn(),
      getCachedAnalysis: vi.fn(async (): Promise<CachedAnalysisResponse> => ({ status: 'none', record: null })),
      clearAnalysisCache: vi.fn()
    },
    presets: { list: vi.fn(async () => []), generateDraft: vi.fn(), save: vi.fn(), setEnabled: vi.fn(), delete: vi.fn() },
    codeReview: { listMyGitCodeMergeRequests: vi.fn(), previewSource: vi.fn(), run: vi.fn(), getGitCodeSettings: vi.fn(), updateGitCodeSettings: vi.fn(), testGitCodeConnection: vi.fn(), clearCache: vi.fn() },
    mailTemplates: { openDraft: vi.fn(async () => undefined), importMessage: vi.fn(async () => null) }
  }
}

function renderDetail(consent = false): void {
  renderDetailWithApi(makeApi(consent))
}

function renderDetailWithApi(api: RestXApi): void {
  Object.defineProperty(window, 'restx', { configurable: true, value: api })
  render(<MemoryRouter><InspectorStateProvider><ConfigDetail document={document} onClose={vi.fn()} /></InspectorStateProvider></MemoryRouter>)
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('ConfigDetail', () => {
  it('shows nested redacted configuration values and never renders the original secret', () => {
    renderDetail()
    expect(screen.getByText('model')).toBeInTheDocument()
    expect(screen.getByText('demo')).toBeInTheDocument()
    expect(screen.getByText('[REDACTED]')).toBeInTheDocument()
    expect(screen.queryByText('top-secret')).not.toBeInTheDocument()
  })

  it('can switch to the redacted text view', () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: '文本' }))
    expect(screen.getByText(/"apiKey": "\[REDACTED\]"/)).toBeInTheDocument()
  })

  it('explains the consent prerequisite before offering network analysis', async () => {
    renderDetail(false)
    fireEvent.click(screen.getByRole('button', { name: 'AI 解析' }))
    await waitFor(() => expect(screen.getByText('尚未允许 AI 分析本地内容')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '前往设置' })).toHaveAttribute('href', '/settings')
  })

  it('displays a valid cached analysis without requesting the model again', async () => {
    const api = makeApi(true)
    api.ai.getCachedAnalysis = vi.fn(async (): Promise<CachedAnalysisResponse> => ({
      status: 'valid',
      record: {
        sourceHash: document.sourceHash,
        analysisFingerprint: 'b'.repeat(64),
        model: 'demo',
        analyzedAt: '2026-07-21T01:00:00.000Z',
        result: {
          summary: '缓存中的配置摘要',
          detectedTool: 'Demo Tool',
          sections: [], risks: [], recommendations: ['无需重复解析']
        }
      }
    }))
    renderDetailWithApi(api)
    fireEvent.click(screen.getByRole('button', { name: 'AI 解析' }))
    await waitFor(() => expect(screen.getByText('缓存中的配置摘要')).toBeInTheDocument())
    expect(screen.getByText('已使用缓存')).toBeInTheDocument()
    expect(api.ai.analyzeConfig).not.toHaveBeenCalled()
  })
})
