// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RestXApi } from '../src/app-api'
import type { ImportedMailMessage } from '../src/features/mail-template/shared/contracts'
import { MailTemplatePage } from '../src/features/mail-template/renderer/MailTemplatePage'

function installApi() {
  const openDraft = vi.fn(async () => undefined)
  const importMessage = vi.fn<() => Promise<ImportedMailMessage | null>>(async () => null)
  Object.defineProperty(window, 'restx', {
    configurable: true,
    value: { mailTemplates: { openDraft, importMessage } } as unknown as RestXApi
  })
  return { openDraft, importMessage }
}

beforeEach(() => {
  localStorage.clear()
  installApi()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('mail template reuse page', () => {
  it('uses defaults, applies per-send overrides, previews, and opens the same draft', async () => {
    const { openDraft } = installApi()
    render(<MailTemplatePage />)

    expect(screen.getByText('【示例项目】本周周报')).toBeInTheDocument()
    expect(screen.getByText(/风险：暂无/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('本次 JSON'), {
      target: { value: '{"projectName":"RestX","progress":70,"managerName":"小王"}' }
    })

    expect(screen.getByText('【RestX】本周周报')).toBeInTheDocument()
    expect(screen.getByText(/小王，您好/)).toBeInTheDocument()
    expect(screen.getByText(/当前进度：70%/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '在 Outlook 中打开' }))

    await waitFor(() => expect(openDraft).toHaveBeenCalledWith(expect.objectContaining({
      to: ['manager@example.com'],
      cc: ['team@example.com'],
      subject: '【RestX】本周周报'
    })))
  })

  it('blocks handoff for malformed JSON and unresolved variables', () => {
    render(<MailTemplatePage />)
    const handoff = screen.getByRole('button', { name: '在 Outlook 中打开' })

    fireEvent.change(screen.getByLabelText('本次 JSON'), { target: { value: '{broken' } })
    expect(screen.getByText(/本次 JSON：JSON 格式有误/)).toBeInTheDocument()
    expect(handoff).toBeDisabled()

    fireEvent.change(screen.getByLabelText('本次 JSON'), { target: { value: '{}' } })
    fireEvent.change(screen.getByLabelText('邮件正文'), { target: { value: '您好，{{missingValue}}' } })
    expect(screen.getAllByText('{{missingValue}}').length).toBeGreaterThan(0)
    expect(screen.getByText('变量 {{missingValue}} 还没有值。')).toBeInTheDocument()
    expect(handoff).toBeDisabled()
  })

  it('creates, saves, duplicates, and deletes reusable templates', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MailTemplatePage />)

    fireEvent.click(screen.getByRole('button', { name: '新建模板' }))
    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '客户通知' } })
    fireEvent.change(screen.getByLabelText('收件人 To'), { target: { value: 'client@example.com' } })
    fireEvent.change(screen.getByLabelText('邮件标题'), { target: { value: '客户通知标题' } })
    fireEvent.change(screen.getByLabelText('邮件正文'), { target: { value: '客户您好' } })
    fireEvent.change(screen.getByLabelText('默认 JSON'), { target: { value: '{}' } })
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }))

    expect(screen.getByRole('button', { name: /客户通知.*客户通知标题/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(screen.getByRole('button', { name: /客户通知 - 副本/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.queryByRole('button', { name: /客户通知 - 副本/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /客户通知.*客户通知标题/ })).toBeInTheDocument()
  })

  it('imports an Outlook message into an unsaved editor and saves it explicitly', async () => {
    const { importMessage } = installApi()
    importMessage.mockResolvedValue({
      sourceName: '客户月报.eml', format: 'eml', to: 'client@example.com', cc: 'team@example.com', bcc: '',
      subject: '客户月报', body: '客户您好，\n本月进度为 70%。', attachmentCount: 1,
      warnings: ['检测到 1 个附件，本次只导入邮件文字内容。']
    })
    render(<MailTemplatePage />)

    fireEvent.click(screen.getByRole('button', { name: '导入 Outlook 邮件' }))
    await waitFor(() => expect(screen.getByLabelText('模板名称')).toHaveValue('客户月报'))
    expect(screen.getByDisplayValue('client@example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/本月进度为 70%/)).toBeInTheDocument()
    expect(screen.getByText('已导入 EML')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /客户月报.*客户月报/ })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('邮件正文'), { target: { value: '客户您好，\n本月进度为 {{progress}}%。' } })
    fireEvent.change(screen.getByLabelText('默认 JSON'), { target: { value: '{"progress":70}' } })
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }))
    expect(screen.getByRole('button', { name: /客户月报.*客户月报/ })).toBeInTheDocument()
  })

  it('preserves the current editor when import is canceled or fails', async () => {
    const { importMessage } = installApi()
    render(<MailTemplatePage />)
    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '正在编辑的模板' } })
    fireEvent.change(screen.getByLabelText('本次 JSON'), { target: { value: '{"progress":88}' } })

    importMessage.mockResolvedValueOnce(null)
    fireEvent.click(screen.getByRole('button', { name: '导入 Outlook 邮件' }))
    await waitFor(() => expect(importMessage).toHaveBeenCalledTimes(1))
    expect(screen.getByDisplayValue('正在编辑的模板')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{"progress":88}')).toBeInTheDocument()

    importMessage.mockRejectedValueOnce(new Error('文件内容无效'))
    fireEvent.click(screen.getByRole('button', { name: '导入 Outlook 邮件' }))
    await waitFor(() => expect(screen.getByText('文件内容无效')).toBeInTheDocument())
    expect(screen.getByDisplayValue('正在编辑的模板')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{"progress":88}')).toBeInTheDocument()
  })
})
