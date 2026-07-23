import { describe, expect, it, vi } from 'vitest'
import type { FieldsData } from '@kenjiuno/msgreader'
import { MAIL_TEMPLATE_LIMITS } from '../src/features/mail-template/shared/contracts'
import {
  importOutlookMessage,
  normalizeMsgFields,
  parseOutlookMessage,
  type MessageImportDependencies
} from '../src/features/mail-template/main/message-import'

const htmlEml = Buffer.from([
  'From: sender@example.com',
  'To: Alice <alice@example.com>, bob@example.com',
  'Cc: Team <team@example.com>',
  'Subject: 项目周报',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="restx-boundary"',
  '',
  '--restx-boundary',
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: 8bit',
  '',
  '<html><head><style>.hidden{display:none}</style></head><body><p>您好&nbsp;团队</p><script>alert(1)</script><div>进度：70%</div></body></html>',
  '--restx-boundary',
  'Content-Type: text/plain; name="report.txt"',
  'Content-Disposition: attachment; filename="report.txt"',
  'Content-Transfer-Encoding: base64',
  '',
  'UmVzdFg=',
  '--restx-boundary--',
  ''
].join('\r\n'))

function dependencies(overrides: Partial<MessageImportDependencies> = {}): MessageImportDependencies {
  return {
    selectFile: vi.fn(async () => '/tmp/weekly.eml'),
    stat: vi.fn(async () => ({ size: htmlEml.length, isFile: () => true })),
    readFile: vi.fn(async () => htmlEml),
    ...overrides
  }
}

describe('Outlook message import', () => {
  it('parses EML recipients and converts HTML-only content without scripts', async () => {
    const imported = await parseOutlookMessage(htmlEml, 'eml', 'weekly.eml')
    expect(imported).toMatchObject({
      sourceName: 'weekly.eml',
      format: 'eml',
      to: 'alice@example.com\nbob@example.com',
      cc: 'team@example.com',
      subject: '项目周报',
      attachmentCount: 1
    })
    expect(imported.body).toContain('您好 团队')
    expect(imported.body).toContain('进度：70%')
    expect(imported.body).not.toContain('alert(1)')
    expect(imported.warnings).toContain('检测到 1 个附件，本次只导入邮件文字内容。')
  })

  it('normalizes MSG recipient groups and HTML fallback into the reduced DTO', () => {
    const fields: FieldsData = {
      dataType: 'msg',
      subject: '客户通知',
      bodyHtml: '<p>客户您好</p><div>请查收。</div>',
      recipients: [
        { dataType: 'recipient', recipType: 'to', name: '客户', email: '/o=exchange/user', smtpAddress: 'client@example.com' },
        { dataType: 'recipient', recipType: 'cc', name: 'team@example.com' }
      ],
      attachments: []
    }
    expect(normalizeMsgFields(fields, 'notice.msg')).toMatchObject({
      format: 'msg', to: 'client@example.com', cc: 'team@example.com', subject: '客户通知', body: '客户您好\n请查收。'
    })
  })

  it('preserves state through cancellation and rejects unsafe file boundaries', async () => {
    const canceled = dependencies({ selectFile: vi.fn(async () => null) })
    expect(await importOutlookMessage(canceled)).toBeNull()
    expect(canceled.stat).not.toHaveBeenCalled()

    await expect(importOutlookMessage(dependencies({ selectFile: vi.fn(async () => '/tmp/file.pdf') }))).rejects.toThrow(/仅支持/)
    await expect(importOutlookMessage(dependencies({
      stat: vi.fn(async () => ({ size: MAIL_TEMPLATE_LIMITS.importFileBytes + 1, isFile: () => true }))
    }))).rejects.toThrow(/25 MB/)
  })

  it('rejects malformed messages and files that change size after selection', async () => {
    await expect(parseOutlookMessage(Buffer.from('not an email'), 'eml', 'bad.eml')).rejects.toThrow(/没有可用|无法解析/)
    await expect(parseOutlookMessage(Buffer.from('not a msg'), 'msg', 'bad.msg')).rejects.toThrow(/内容无效|无法解析/)
    await expect(importOutlookMessage(dependencies({
      readFile: vi.fn(async () => Buffer.alloc(MAIL_TEMPLATE_LIMITS.importFileBytes + 1))
    }))).rejects.toThrow(/大小无效/)
  })
})
