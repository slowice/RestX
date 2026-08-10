// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { normalizeClipboardTable, normalizeExcelHtml, tabularTextToHtml } from '../src/features/mail-template/renderer/excel-paste'
import { MAIL_TEMPLATE_LIMITS } from '../src/features/mail-template/shared/contracts'

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
    expect(result).toMatchObject({ kind: 'table', mode: 'tabular-text' })
    expect(result?.kind === 'table' ? result.html.match(/<tr>/g) : []).toHaveLength(2)
    expect(result?.kind === 'table' ? result.html.match(/<td/g) : []).toHaveLength(4)
    expect(tabularTextToHtml('普通文本')).toBeNull()
  })

  it('keeps oversized Office metadata on the rich path when the normalized table is bounded', () => {
    const table = '<table><tr><td colspan="2" rowspan="2" style="border:.5pt solid windowtext">合并</td><td>C1</td></tr><tr><td>C2</td></tr></table>'
    const html = `<html><head><meta data-office-metadata="${'x'.repeat(570_000)}"></head><body>${table}</body></html>`
    expect(html.length).toBeGreaterThan(500_000)
    const result = normalizeClipboardTable({ html, text: '合并\t\tC1\n\t\tC2' })
    expect(result).toMatchObject({ kind: 'table', mode: 'excel-html' })
    expect(result?.kind === 'table' ? result.html : '').toContain('colspan="2"')
    expect(result?.kind === 'table' ? result.html : '').toContain('rowspan="2"')
  })

  it('rejects rich tables beyond the hard clipboard boundary instead of flattening them', () => {
    const html = `<table><tr><td>超大表格</td></tr></table><!--${'x'.repeat(MAIL_TEMPLATE_LIMITS.clipboardHtml)}-->`
    expect(normalizeClipboardTable({ html, text: '超大表格\t会退化' })).toMatchObject({
      kind: 'rejected', message: expect.stringContaining('缩小复制范围')
    })
    expect(normalizeClipboardTable({ html: 'x'.repeat(500_001), text: 'plain' })).toBeNull()
  })
})
