// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RestXApi } from '../src/app-api'
import type { AiProviderState } from '../src/platform/ai-provider/shared/contracts'

vi.mock('../src/features/ai-inspector/renderer', () => ({
  useInspectorState: () => ({
    preferences: { recentDirectory: null, aiLocalAnalysisEnabled: false },
    clearHistory: vi.fn(),
    setAiConsent: vi.fn()
  })
}))

vi.mock('../src/features/code-review/renderer', () => ({
  CodeReviewSettingsSection: () => null
}))

import { SettingsPage } from '../src/features/settings/renderer/SettingsPage'

const initialState: AiProviderState = {
  activeProviderId: 'manual-1',
  providers: [
    {
      id: 'manual-1', name: 'Google', source: 'manual', baseUrl: 'https://google.example/v1',
      modelId: 'gemini', useSystemProxy: false, customHeaders: {}, apiKeyConfigured: true, status: 'ready',
      active: true, editable: true, identityFingerprint: 'manual-identity'
    },
    {
      id: 'claude-1', name: 'Claude Code', source: 'claude-code', baseUrl: 'https://claude.example/v1',
      modelId: 'claude', useSystemProxy: false, customHeaders: {}, apiKeyConfigured: true, status: 'ready',
      active: false, editable: false, identityFingerprint: 'claude-identity'
    }
  ]
}

function installApi(): RestXApi {
  const setSystemProxy = vi.fn(async (id: string, enabled: boolean): Promise<AiProviderState> => ({
    ...initialState,
    providers: initialState.providers.map((provider) =>
      provider.id === id ? { ...provider, useSystemProxy: enabled } : provider
    )
  }))
  const setCustomHeaders = vi.fn(async (id: string, headers: Array<{ name: string; value: string }>): Promise<AiProviderState> => ({
    ...initialState,
    providers: initialState.providers.map((provider) =>
      provider.id === id ? { ...provider, customHeaders: Object.fromEntries(headers.filter((header) => header.name).map(({ name, value }) => [name, value])) } : provider
    )
  }))
  const api: RestXApi = {
    app: {
      getVersion: vi.fn(async () => '0.1.0'),
      getPreferences: vi.fn(),
      setAiLocalAnalysisEnabled: vi.fn(),
      clearHistory: vi.fn()
    },
    providers: {
      getState: vi.fn(async () => initialState),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      setActive: vi.fn(),
      setSystemProxy,
      setCustomHeaders,
      test: vi.fn(),
      refreshExternal: vi.fn()
    },
    inspector: {
      chooseDirectory: vi.fn(), scanDirectory: vi.fn(), readConfig: vi.fn(), readJsonlPage: vi.fn(),
      readJsonlEntry: vi.fn(), searchJsonlWorkspace: vi.fn(), revealInFolder: vi.fn()
    },
    ai: {
      analyzeConfig: vi.fn(), getCachedAnalysis: vi.fn(), clearAnalysisCache: vi.fn()
    },
    presets: {
      list: vi.fn(), generateDraft: vi.fn(), save: vi.fn(), setEnabled: vi.fn(), delete: vi.fn()
    },
    codeReview: {
      listMyGitCodeMergeRequests: vi.fn(), previewSource: vi.fn(), run: vi.fn(),
      getGitCodeSettings: vi.fn(), updateGitCodeSettings: vi.fn(), testGitCodeConnection: vi.fn(),
      getCodeHubSettings: vi.fn(), updateCodeHubSettings: vi.fn(), clearCache: vi.fn()
    },
    knowledge: {
      scan: vi.fn(), read: vi.fn(), classify: vi.fn(), apply: vi.fn(), saveEdits: vi.fn(), open: vi.fn(), openRoot: vi.fn()
    },
    mailTemplates: {
      openDraft: vi.fn(), importMessage: vi.fn()
    },
    frequentSkills: {
      list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), importSkill: vi.fn(), execute: vi.fn()
    }
  }
  Object.defineProperty(window, 'restx', { configurable: true, value: api })
  return api
}

afterEach(() => cleanup())

describe('SettingsPage Provider proxy preference', () => {
  it('shows the switch for manual and external Providers and updates the selected Provider', async () => {
    const api = installApi()
    render(<SettingsPage />)

    expect(await screen.findByRole('switch', { name: '为 Google 使用系统代理' })).toHaveAttribute('aria-checked', 'false')
    const externalSwitch = screen.getByRole('switch', { name: '为 Claude Code 使用系统代理' })
    fireEvent.click(externalSwitch)

    await waitFor(() => expect(api.providers.setSystemProxy).toHaveBeenCalledWith('claude-1', true))
    expect(screen.getByRole('switch', { name: '为 Claude Code 使用系统代理' })).toHaveAttribute('aria-checked', 'true')
  })

  it('edits RestX-managed request headers for an external Provider', async () => {
    const api = installApi()
    render(<SettingsPage />)

    await screen.findByText('Claude Code')
    fireEvent.click(screen.getByRole('button', { name: '配置 Claude Code 的自定义请求头' }))
    fireEvent.change(screen.getByLabelText('请求头名称 1'), { target: { value: 'Authorization' } })
    fireEvent.change(screen.getByLabelText('请求头值 1'), { target: { value: 'Gateway token' } })
    fireEvent.click(screen.getByRole('button', { name: '保存请求头' }))

    await waitFor(() => expect(api.providers.setCustomHeaders).toHaveBeenCalledWith('claude-1', [{ name: 'Authorization', value: 'Gateway token' }]))
  })
})
