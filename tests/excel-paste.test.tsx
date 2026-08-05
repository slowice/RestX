// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { normalizeClipboardTable, normalizeExcelHtml, tabularTextToHtml } from '../src/features/mail-template/renderer/excel-paste'

describe('Excel clipboard table conversion', () => {
  it('materializes supported Excel class styles and merged cells', () => {
    const html = '<html><head><style>td.xl65 { color: #ff0000; background: #ffff00; text-align: center; border: .5pt solid windowtext; mso-number-format: General; }</style></head><body><table width="320"><tr><td class="xl65" colspan="2" onclick="bad()"><font face="等线" size="3">项目</font></td></tr><tr><td>A</td><td>B</td></tr></table><script>bad()</script></body></html>'
    const result = normalizeExcelHtml(html)
    expect(result).toContain('colspan="2"')
    expect(result).toMatch(/background-color:\s*#ffff00/)
    expect(result).toMatch(/text-align:\s*center/)
    expect(result).toMatch(/font-family:\s*等线/)
    expect(result).toMatch(/border:\s*\.5pt solid #000000/)
    expect(result).not.toMatch(/onclick|mso-|script/)
  })

  it('falls back to a rectangular table for tabular text', () => {
    const result = normalizeClipboardTable({ html: '', text: '姓名\t进度\n小王\t70%' })
    expect(result?.mode).toBe('tabular-text')
    expect(result?.html.match(/<tr>/g)).toHaveLength(2)
    expect(result?.html.match(/<td/g)).toHaveLength(4)
    expect(tabularTextToHtml('普通文本')).toBeNull()
  })

  it('rejects unbounded or non-tabular clipboard input', () => {
    expect(normalizeClipboardTable({ html: 'x'.repeat(500_001), text: 'plain' })).toBeNull()
  })
})
