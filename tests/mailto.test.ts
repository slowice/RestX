import { describe, expect, it } from 'vitest'
import { buildMailtoUri } from '../src/features/mail-template/main/mailto'

describe('mail template mailto boundary', () => {
  it('builds a bounded mailto URI from a structured valid draft', () => {
    const uri = buildMailtoUri({
      to: ['one@example.com', 'two@example.com'],
      cc: ['team@example.com'],
      bcc: [],
      subject: '项目 周报',
      body: '第一行\n第二行'
    })
    expect(uri).toMatch(/^mailto:/)
    expect(uri).toContain('one%40example.com,two%40example.com')
    expect(uri).toContain('cc=team%40example.com')
    expect(uri).toContain('subject=%E9%A1%B9%E7%9B%AE%20%E5%91%A8%E6%8A%A5')
    expect(uri).toContain('body=%E7%AC%AC%E4%B8%80%E8%A1%8C%0A%E7%AC%AC%E4%BA%8C%E8%A1%8C')
  })

  it('rejects arbitrary, invalid, and oversized input', () => {
    expect(() => buildMailtoUri('https://example.com')).toThrow(/草稿参数无效/)
    expect(() => buildMailtoUri({ to: ['bad'], cc: [], bcc: [], subject: '主题', body: '正文' })).toThrow(/无效邮箱/)
    expect(() => buildMailtoUri({ to: ['user@example.com'], cc: [], bcc: [], subject: '主题', body: '中'.repeat(12_000) })).toThrow(/内容较长/)
  })
})
