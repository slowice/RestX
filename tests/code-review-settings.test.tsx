// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeReviewSettingsSection } from '../src/features/code-review/renderer'

afterEach(() => cleanup())

describe('CodeReviewSettingsSection', () => {
  it('loads source credentials, saves CodeHub PRIVATE-TOKEN, and delegates AI configuration to the shared Provider center', async () => {
    const codeReview = {
      previewSource: vi.fn(),
      run: vi.fn(),
      getGitCodeSettings: vi.fn(async () => ({ apiBaseUrl: 'https://api.gitcode.com/api/v5', accessTokenConfigured: true })),
      updateGitCodeSettings: vi.fn(),
      testGitCodeConnection: vi.fn(),
      getCodeHubSettings: vi.fn(async () => ({ privateTokenConfigured: false })),
      updateCodeHubSettings: vi.fn(async () => ({ privateTokenConfigured: true })),
      clearCache: vi.fn()
    }
    Object.defineProperty(window, 'restx', { configurable: true, value: { codeReview } })

    render(<CodeReviewSettingsSection />)

    await waitFor(() => expect(screen.getByText('GitCode 已配置')).toBeInTheDocument())
    expect(screen.getByText('CodeHub 待配置')).toBeInTheDocument()
    expect(screen.getByText(/AI 模型统一使用上方当前 Provider/)).toBeInTheDocument()
    expect(screen.queryByText('蓝区 · 开放区 AI')).not.toBeInTheDocument()
    expect(screen.queryByText('黄区 · 内部 AI')).not.toBeInTheDocument()
    expect(codeReview.getGitCodeSettings).toHaveBeenCalledOnce()
    expect(codeReview.getCodeHubSettings).toHaveBeenCalledOnce()

    fireEvent.change(screen.getByPlaceholderText('输入 CodeHub PRIVATE-TOKEN'), { target: { value: 'codehub-secret' } })
    fireEvent.click(screen.getByRole('button', { name: '保存 PRIVATE-TOKEN' }))
    await waitFor(() => expect(codeReview.updateCodeHubSettings).toHaveBeenCalledWith({ privateToken: 'codehub-secret' }))
    expect(screen.getByText('CodeHub 已配置')).toBeInTheDocument()
    expect(screen.getByText('CodeHub PRIVATE-TOKEN 已安全保存。')).toBeInTheDocument()
  })
})
