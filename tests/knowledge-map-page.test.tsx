// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { RestXApi } from '../src/app-api'
import { buildKnowledgeGraph, buildKnowledgeLabelCatalog } from '../src/features/knowledge-map/main/services/knowledge-catalog'
import { KnowledgeMapPage } from '../src/features/knowledge-map/renderer/KnowledgeMapPage'
import type {
  KnowledgeClassificationSuggestion,
  KnowledgeProblemSummary,
  KnowledgeScanResult
} from '../src/features/knowledge-map/shared/contracts'

const pending: KnowledgeProblemSummary = {
  id: 'pending.md',
  name: 'pending.md',
  title: '标签应该存在哪里？',
  status: 'pending',
  sizeBytes: 120,
  modifiedAt: '2026-07-24T08:00:00.000Z',
  sourceFingerprint: 'a'.repeat(64)
}

const organized: KnowledgeProblemSummary = {
  id: 'organized.md',
  name: 'organized.md',
  title: '如何安全读取本地 MD？',
  status: 'organized',
  sizeBytes: 240,
  modifiedAt: '2026-07-24T09:00:00.000Z',
  sourceFingerprint: 'b'.repeat(64),
  labels: {
    scene: '知识管理器',
    capabilities: ['本地文件集成'],
    knowledge: ['Electron IPC']
  }
}

function scanResult(problems: KnowledgeProblemSummary[] = [pending, organized]): KnowledgeScanResult {
  return {
    rootDisplayPath: '~/.restx/knowledge',
    scannedAt: '2026-07-24T10:00:00.000Z',
    problems,
    graph: buildKnowledgeGraph(problems),
    catalog: buildKnowledgeLabelCatalog(problems),
    skipped: []
  }
}

function installApi() {
  let result = scanResult()
  const suggestion: KnowledgeClassificationSuggestion = {
    problemId: pending.id,
    sourceFingerprint: pending.sourceFingerprint,
    scene: { value: '知识管理器', existing: true },
    capabilities: [{ value: '知识建模', existing: false }],
    knowledge: [{ value: 'YAML Frontmatter', existing: false }]
  }
  const api = {
    scan: vi.fn(async () => result),
    read: vi.fn(async (problemId: string) => ({
      ...(problemId === pending.id ? pending : organized),
      markdown: problemId === pending.id ? '# 标签应该存在哪里？\n\n问题正文' : '# 如何安全读取本地 MD？'
    })),
    classify: vi.fn(async () => suggestion),
    apply: vi.fn(async (input) => {
      const updated: KnowledgeProblemSummary = {
        ...pending,
        status: 'organized',
        labels: {
          scene: input.scene,
          capabilities: input.capabilities,
          knowledge: input.knowledge
        }
      }
      result = scanResult([updated, organized])
      return result
    }),
    open: vi.fn(async () => undefined),
    openRoot: vi.fn(async () => undefined)
  } satisfies RestXApi['knowledge']
  Object.defineProperty(window, 'restx', {
    configurable: true,
    value: { knowledge: api } as unknown as RestXApi
  })
  return api
}

beforeEach(() => installApi())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('KnowledgeMapPage', () => {
  test('loads the layered graph and keeps unclassified Markdown in the pending area', async () => {
    render(<KnowledgeMapPage />)

    expect(await screen.findByRole('heading', { name: '知识图谱' })).toBeInTheDocument()
    expect(await screen.findByText('知识管理器')).toBeInTheDocument()
    expect(screen.getByText('本地文件集成')).toBeInTheDocument()
    expect(screen.getByText('Electron IPC')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /待整理.*标签应该存在哪里/ })).toBeInTheDocument()
    expect(document.querySelector('marker#knowledge-arrow')).toBeInTheDocument()
  })

  test('previews one problem and applies an editable AI suggestion', async () => {
    const api = installApi()
    render(<KnowledgeMapPage />)
    const pendingButton = await screen.findByRole('button', { name: /待整理.*标签应该存在哪里/ })
    fireEvent.click(pendingButton)

    await waitFor(() => expect(api.read).toHaveBeenCalledWith('pending.md'))
    expect(api.scan).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('问题正文')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'AI 整理' }))

    await waitFor(() => expect(api.classify).toHaveBeenCalledWith('pending.md'))
    expect(await screen.findByRole('dialog', { name: '确认 AI 整理结果' })).toBeInTheDocument()
    expect(screen.getByText('复用已有')).toBeInTheDocument()
    expect(screen.getAllByText('新增').length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('能力标签'), { target: { value: '知识建模\n信息架构' } })
    fireEvent.click(screen.getByRole('button', { name: '确认并写回' }))

    await waitFor(() => expect(api.apply).toHaveBeenCalledWith(expect.objectContaining({
      problemId: 'pending.md',
      scene: '知识管理器',
      capabilities: ['知识建模', '信息架构'],
      knowledge: ['YAML Frontmatter']
    })))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /待整理.*标签应该存在哪里/ })).not.toBeInTheDocument()
  })

  test('shows an empty knowledge directory action', async () => {
    const api = installApi()
    api.scan.mockResolvedValue(scanResult([]))
    render(<KnowledgeMapPage />)

    expect(await screen.findByText('知识目录还是空的')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '打开知识目录' }))
    expect(api.openRoot).toHaveBeenCalled()
  })
})
