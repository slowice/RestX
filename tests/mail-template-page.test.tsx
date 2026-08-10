// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RestXApi } from '../src/app-api'
import type { ImportedMailMessage } from '../src/features/mail-template/shared/contracts'
import { MailTemplatePage } from '../src/features/mail-template/renderer/MailTemplatePage'

if (typeof Range !== 'undefined' && typeof Range.prototype.getClientRects !== 'function') {
  Object.defineProperties(Range.prototype, {
    getClientRects: { value: () => [] },
    getBoundingClientRect: { value: () => new DOMRect() }
  })
}

function installApi() {
  const openDraft = vi.fn(async () => undefined)
  const importMessage = vi.fn<() => Promise<ImportedMailMessage | null>>(async () => null)
  Object.defineProperty(window, 'restx', {
    configurable: true,
    value: { mailTemplates: { openDraft, importMessage } } as unknown as RestXApi
  })
  return { openDraft, importMessage }
}

function pasteBody(html: string, text: string): void {
  fireEvent.paste(screen.getByLabelText('邮件正文'), {
    clipboardData: { getData: (type: string) => type === 'text/html' ? html : type === 'text/plain' ? text : '' }
  })
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
    expect(await screen.findByText('已在经典 Outlook 中打开草稿，请检查后再发送。')).toBeInTheDocument()
  })

  it('blocks handoff for malformed JSON and unresolved variables', () => {
    render(<MailTemplatePage />)
    const handoff = screen.getByRole('button', { name: '在 Outlook 中打开' })

    fireEvent.change(screen.getByLabelText('本次 JSON'), { target: { value: '{broken' } })
    expect(screen.getByText(/本次 JSON：JSON 格式有误/)).toBeInTheDocument()
    expect(handoff).toBeDisabled()

    fireEvent.change(screen.getByLabelText('本次 JSON'), { target: { value: '{}' } })
    pasteBody('<p>您好，{{missingValue}}</p>', '您好，{{missingValue}}')
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
    pasteBody('<p>客户您好</p>', '客户您好')
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
    expect(screen.getByLabelText('邮件正文')).toHaveTextContent(/本月进度为 70%/)
    expect(screen.getByText('已导入 EML')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /客户月报.*客户月报/ })).not.toBeInTheDocument()

    pasteBody('<p>本月进度变量：{{progress}}%</p>', '本月进度变量：{{progress}}%')
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

  it('inserts and pastes editable tables in the rich body', () => {
    render(<MailTemplatePage />)
    fireEvent.click(screen.getByRole('button', { name: '插入表格' }))
    expect(screen.getByLabelText('邮件正文').querySelector('table')).toBeInTheDocument()

    pasteBody('<table><tr><td style="background-color:#ffff00;border:1px solid #000000">Excel</td><td>70%</td></tr></table>', 'Excel\t70%')
    expect(screen.getByText('Excel 表格已按安全邮件格式粘贴。')).toBeInTheDocument()
    expect(screen.getByLabelText('邮件正文').querySelectorAll('table').length).toBeGreaterThanOrEqual(2)
  })

  it('expands editor and preview independently without losing rich body edits', () => {
    const { container } = render(<MailTemplatePage />)
    pasteBody('<table><tr><td>专注模式表格</td><td>保留内容</td></tr></table>', '专注模式表格\t保留内容')

    fireEvent.click(screen.getByRole('button', { name: '展开编辑区' }))
    expect(container.querySelector('.mail-template-page')).toHaveClass('is-focus-mode', 'mode-editor')
    expect(screen.getByLabelText('邮件正文')).toHaveTextContent('专注模式表格')

    fireEvent.click(screen.getByRole('button', { name: '切换到预览区' }))
    expect(container.querySelector('.mail-template-page')).toHaveClass('mode-preview')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('.mail-template-page')).not.toHaveClass('is-focus-mode')
    expect(container.querySelector('.mail-template-page')).toHaveClass('mode-normal')
    expect(screen.getByLabelText('邮件正文')).toHaveTextContent('专注模式表格')
  })

  it('toggles adaptive display without writing scale styles into the mail body', () => {
    render(<MailTemplatePage />)
    pasteBody('<table style="width:900px"><tr><td>宽表格</td><td>内容</td></tr></table>', '宽表格\t内容')

    const autoButtons = screen.getAllByRole('button', { name: /自动缩放/ })
    expect(autoButtons).toHaveLength(2)
    fireEvent.click(autoButtons[0])
    expect(screen.getAllByRole('button', { name: '实际大小 100%' })).toHaveLength(2)

    const editorBody = screen.getByLabelText('邮件正文')
    expect(editorBody.innerHTML).not.toMatch(/zoom|transform|mail-scale/i)
    expect(document.querySelector('.preview-body')?.innerHTML).not.toMatch(/zoom|transform|mail-scale/i)
  })

  it('preserves Excel borders and merged cells through the editor and preview', async () => {
    render(<MailTemplatePage />)
    const html = '<html><head><style>td.xl65{border:.5pt solid windowtext;background:#fff2cc;text-align:center}td.xl66{border-top:1pt double #ff0000;border-right:.5pt solid windowtext;border-bottom:.5pt solid windowtext;border-left:.5pt solid windowtext}</style></head><body><table style="border-collapse:collapse"><tr><td class="xl65" colspan="2" rowspan="2">合并区域</td><td class="xl66">C1</td></tr><tr><td class="xl66">C2</td></tr></table></body></html>'
    pasteBody(html, '合并区域\t\tC1\n\t\tC2')

    const editorMerged = screen.getByLabelText('邮件正文').querySelector('td[colspan="2"][rowspan="2"]') as HTMLTableCellElement | null
    expect(editorMerged).toBeInTheDocument()
    expect(editorMerged?.style.border).toMatch(/0\.5pt solid/)

    await waitFor(() => {
      const previewMerged = document.querySelector('.preview-body td[colspan="2"][rowspan="2"]') as HTMLTableCellElement | null
      expect(previewMerged).toBeInTheDocument()
      expect(previewMerged?.style.border).toMatch(/0\.5pt solid/)
    })
  })
})
