// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeReviewSettingsSection } from '../src/features/code-review/renderer'

afterEach(() => cleanup())

describe('CodeReviewSettingsSection', () => {
  it('loads GitCode and isolated blue/yellow provider settings through the feature API', async () => {
    const codeReview = {
      previewSource: vi.fn(),
      run: vi.fn(),
      getGitCodeSettings: vi.fn(async () => ({ apiBaseUrl: 'https://api.gitcode.com/api/v5', accessTokenConfigured: true })),
      updateGitCodeSettings: vi.fn(),
      testGitCodeConnection: vi.fn(),
      getZoneProviders: vi.fn(async () => ({
        blue: { provider: 'openai-compatible' as const, baseUrl: 'https://blue.example/v1', model: 'blue-model', apiKeyConfigured: true },
        yellow: { provider: 'openai-compatible' as const, baseUrl: 'https://yellow.example/v1', model: 'yellow-model', apiKeyConfigured: false }
      })),
      updateZoneProvider: vi.fn(),
      clearCache: vi.fn()
    }
    Object.defineProperty(window, 'restx', { configurable: true, value: { codeReview } })

    render(<CodeReviewSettingsSection />)

    await waitFor(() => expect(screen.getByText('GitCode 已配置')).toBeInTheDocument())
    expect(screen.getByText('蓝区 · 开放区 AI')).toBeInTheDocument()
    expect(screen.getByText('黄区 · 内部 AI')).toBeInTheDocument()
    expect(screen.getByDisplayValue('blue-model')).toBeInTheDocument()
    expect(screen.getByDisplayValue('yellow-model')).toBeInTheDocument()
    expect(codeReview.getGitCodeSettings).toHaveBeenCalledOnce()
    expect(codeReview.getZoneProviders).toHaveBeenCalledOnce()
  })
})
