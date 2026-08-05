import { describe, expect, it } from 'vitest'
import { highlightMissingVariables, mailHtmlToText, plainTextToMailHtml, sanitizeMailHtml } from '../src/features/mail-template/shared/rich-body'
import { renderRichBody } from '../src/features/mail-template/shared/template-engine'

describe('rich mail body boundary', () => {
  it('keeps mail-safe tables while removing executable and remote content', () => {
    const source = '<style>.x{color:red}</style><table onclick="bad()"><tr><td style="border: 1px solid #000000; background-image:url(https://bad)">A</td></tr></table><img src="https://bad"><script>alert(1)</script>'
    const sanitized = sanitizeMailHtml(source)
    expect(sanitized.html).toContain('<table>')
    expect(sanitized.html).toContain('border:1px solid #000000')
    expect(sanitized.html).not.toMatch(/onclick|background-image|https:|script|img|alert/)
    expect(sanitized.changed).toBe(true)
  })

  it('renders placeholders only as escaped text inside rich nodes', () => {
    const rendered = renderRichBody('<table><tr><td>{{owner.name}}</td><td>{{missing}}</td></tr></table>', { owner: { name: '<script>bad()</script>' } })
    expect(rendered.html).toContain('&lt;script&gt;bad()&lt;/script&gt;')
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.missing).toEqual(['missing'])
    expect(highlightMissingVariables(rendered.html, rendered.missing)).toContain('<mark data-missing-variable="missing">{{missing}}</mark>')
  })

  it('derives readable table text and safely migrates plain text', () => {
    const migrated = plainTextToMailHtml('<b>文字</b>\n第二行')
    expect(migrated).toContain('&lt;b&gt;文字&lt;/b&gt;')
    expect(mailHtmlToText('<table><tr><td>A &amp; B</td><td>C</td></tr></table>')).toBe('A & B\tC')
  })
})
