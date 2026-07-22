// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { RestXApi } from '../src/app-api'
import type { CodeReviewResult, ReviewSourcePreview } from '../src/features/code-review/shared/contracts/code-review'
import { CodeReviewPage } from '../src/features/code-review/renderer/CodeReviewPage'

const preview: ReviewSourcePreview = {
  sourceId: 'gitcode:OpenMatrix/MatrixAssistant#1958@sha',
  locator: { platform: 'gitcode', zone: 'blue', owner: 'OpenMatrix', repository: 'MatrixAssistant', number: 1958, webUrl: 'https://gitcode.com/OpenMatrix/MatrixAssistant/pull/1958' },
  title: '修复任务执行问题', state: 'merged', author: 'xubin', baseBranch: 'master', headBranch: 'fix/task', headSha: 'sha',
  files: [{ path: 'src/Demo.java', status: 'modified', additions: 3, deletions: 1, eligible: true, patchCharacters: 120 }],
  additions: 3, deletions: 1, eligibleFiles: 1, excludedFiles: 0, inputCharacters: 120, contextMode: 'remote-limited'
}

const result: CodeReviewResult = {
  reviewId: 'review', sourceId: preview.sourceId, summary: '发现一个明确的敏感日志问题。', reviewedFiles: 1, excludedFiles: 0, model: 'demo', rules: [{ id: 'logging-quality', name: '日志规范', version: '1.0.0' }], analyzedAt: '2026-07-22T00:00:00.000Z', expiresAt: '2026-07-29T00:00:00.000Z', cacheStatus: 'miss',
  findings: [{ id: 'finding', severity: 'P1', category: 'logging', title: '日志输出访问令牌', explanation: '新增日志会把令牌写入文件。', evidence: 'log.info("token {}", token)', filePath: 'src/Demo.java', startLine: 42, ruleId: 'LOG-001', confidence: 'high', suggestion: '删除令牌字段。' }]
}

function makeApi(): RestXApi {
  return {
    inspector: { chooseDirectory: vi.fn(), scanDirectory: vi.fn(), readConfig: vi.fn(), readJsonlPage: vi.fn(), readJsonlEntry: vi.fn(), revealInFolder: vi.fn() },
    app: { getVersion: vi.fn(), getPreferences: vi.fn(), setAiLocalAnalysisEnabled: vi.fn(), clearHistory: vi.fn() },
    ai: { getRuntimeStatus: vi.fn(), getProviderSettings: vi.fn(), updateProviderSettings: vi.fn(), analyzeConfig: vi.fn(), getCachedAnalysis: vi.fn(), clearAnalysisCache: vi.fn() },
    presets: { list: vi.fn(), generateDraft: vi.fn(), save: vi.fn(), setEnabled: vi.fn(), delete: vi.fn() },
    codeReview: {
      listMyGitCodeMergeRequests: vi.fn(async () => ({
        identity: { localGitEmail: 'xubin@example.com', accountLogin: 'xubin', accountName: '徐斌', match: 'matched' as const },
        mergeRequests: [], fetchedAt: '2026-07-22T00:00:00.000Z'
      })), previewSource: vi.fn(async () => preview), run: vi.fn(async () => result), getGitCodeSettings: vi.fn(), updateGitCodeSettings: vi.fn(), testGitCodeConnection: vi.fn(), getZoneProviders: vi.fn(), updateZoneProvider: vi.fn(), clearCache: vi.fn()
    }
  }
}

afterEach(() => cleanup())

describe('CodeReviewPage', () => {
  it('loads a GitCode PR preview and displays structured findings', async () => {
    const api = makeApi()
    Object.defineProperty(window, 'restx', { configurable: true, value: api })
    render(<MemoryRouter><CodeReviewPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: /使用示例/ }))
    fireEvent.click(screen.getByRole('button', { name: '读取变更并预览' }))
    await waitFor(() => expect(screen.getByText(/#1958 修复任务执行问题/)).toBeInTheDocument())
    expect(screen.getByText('src/Demo.java')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '开始 AI 检视' }))
    await waitFor(() => expect(screen.getByText('日志输出访问令牌')).toBeInTheDocument())
    expect(screen.getByText(/src\/Demo.java:42/)).toBeInTheDocument()
    expect(api.codeReview.run).toHaveBeenCalledWith(expect.objectContaining({ zone: 'blue', force: false }))
  })

  it('switches to yellow zone and clears blue source state', () => {
    const api = makeApi()
    Object.defineProperty(window, 'restx', { configurable: true, value: api })
    render(<MemoryRouter><CodeReviewPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /使用示例/ }))
    fireEvent.click(screen.getByRole('button', { name: /黄区 · 代码保密区/ }))
    expect(screen.getByText('CodeHub Merge Request')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('进入黄区后配置 CodeHub 域名')).toBeDisabled()
  })

  it('selects an open MR without paste and marks a clean result as passed', async () => {
    const api = makeApi()
    const listed = {
      sourceId: preview.sourceId,
      locator: preview.locator,
      title: preview.title,
      state: 'open',
      author: 'xubin',
      baseBranch: preview.baseBranch,
      headBranch: preview.headBranch,
      headSha: preview.headSha,
      updatedAt: '2026-07-22T00:00:00.000Z',
      draft: false,
      review: { status: 'unreviewed' as const }
    }
    vi.mocked(api.codeReview.listMyGitCodeMergeRequests).mockResolvedValue({
      identity: { localGitEmail: 'xubin@example.com', accountLogin: 'xubin', accountName: '徐斌', match: 'matched' },
      mergeRequests: [listed], fetchedAt: '2026-07-22T00:00:00.000Z'
    })
    vi.mocked(api.codeReview.run).mockResolvedValue({ ...result, sourceId: preview.sourceId, findings: [], summary: '未发现明确问题。' })
    Object.defineProperty(window, 'restx', { configurable: true, value: api })
    render(<MemoryRouter><CodeReviewPage /></MemoryRouter>)

    const choice = await screen.findByRole('button', { name: /OpenMatrix\/MatrixAssistant #1958/ })
    fireEvent.click(choice)
    await waitFor(() => expect(api.codeReview.previewSource).toHaveBeenCalledWith({ url: preview.locator.webUrl, zone: 'blue' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '开始 AI 检视' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '开始 AI 检视' }))
    await waitFor(() => expect(screen.getByText('检视通过')).toBeInTheDocument())
  })
})
