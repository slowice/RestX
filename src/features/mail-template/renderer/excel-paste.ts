import { MAIL_TEMPLATE_LIMITS } from '../shared/contracts'
import { escapeHtml, sanitizeMailHtml, sanitizeMailStyle } from '../shared/rich-body'

export type ClipboardTableResult = {
  kind: 'table'
  html: string
  mode: 'excel-html' | 'tabular-text'
} | {
  kind: 'rejected'
  message: string
}

const SUPPORTED_STYLE_PROPERTIES = new Set([
  'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration',
  'text-align', 'vertical-align', 'white-space', 'width', 'min-width', 'max-width', 'height', 'padding',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border', 'border-top', 'border-right',
  'border-bottom', 'border-left', 'border-color', 'border-width', 'border-style', 'border-collapse',
  'border-spacing', 'table-layout', 'line-height'
])

export function normalizeClipboardTable(input: { html: string; text: string }): ClipboardTableResult | null {
  const hasHtmlTable = /<table(?:\s|>)/i.test(input.html)
  if (hasHtmlTable) {
    if (input.html.length > MAIL_TEMPLATE_LIMITS.clipboardHtml) return rejectedRichTable()
    const converted = normalizeExcelHtml(input.html)
    return converted
      ? { kind: 'table', html: converted, mode: 'excel-html' }
      : rejectedRichTable()
  }
  const fallback = tabularTextToHtml(input.text)
  return fallback ? { kind: 'table', html: fallback, mode: 'tabular-text' } : null
}

export function normalizeExcelHtml(source: string): string | null {
  if (!source || source.length > MAIL_TEMPLATE_LIMITS.clipboardHtml || typeof DOMParser === 'undefined') return null
  const document = new DOMParser().parseFromString(source, 'text/html')
  const table = document.querySelector('table')
  if (!table) return null
  const rows = table.querySelectorAll('tr')
  const cells = table.querySelectorAll('td, th')
  if (rows.length === 0 || rows.length > MAIL_TEMPLATE_LIMITS.tableRows || cells.length > MAIL_TEMPLATE_LIMITS.tableCells) return null
  if ([...rows].some((row) => row.querySelectorAll(':scope > td, :scope > th').length > MAIL_TEMPLATE_LIMITS.tableColumns)) return null

  const classStyles = readClassStyles(document)
  for (const font of [...table.querySelectorAll('font')]) replaceLegacyFont(font)
  for (const element of [table, ...table.querySelectorAll('*')]) {
    materializeElementStyle(element, classStyles)
    removeUnsafeAttributes(element)
  }
  for (const cell of cells) boundCellSpans(cell)

  const html = sanitizeMailHtml(table.outerHTML).html
  return html.includes('<table') && html.length <= MAIL_TEMPLATE_LIMITS.bodyHtml ? html : null
}

export function tabularTextToHtml(source: string): string | null {
  const normalized = source.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  if (!normalized.includes('\t')) return null
  const rows = normalized.split('\n')
  if (rows.length === 0 || rows.length > MAIL_TEMPLATE_LIMITS.tableRows) return null
  const grid = rows.map((row) => row.split('\t'))
  const columns = Math.max(...grid.map((row) => row.length))
  if (columns < 2 || columns > MAIL_TEMPLATE_LIMITS.tableColumns || rows.length * columns > MAIL_TEMPLATE_LIMITS.tableCells) return null
  const cellStyle = 'border: 1px solid #b8b8b8; padding: 4px; vertical-align: middle'
  const body = grid.map((row) => `<tr>${Array.from({ length: columns }, (_, index) => `<td style="${cellStyle}"><p>${escapeHtml(row[index] ?? '')}</p></td>`).join('')}</tr>`).join('')
  return sanitizeMailHtml(`<table style="border-collapse: collapse; table-layout: auto"><tbody>${body}</tbody></table>`).html
}

function readClassStyles(document: Document): Map<string, string> {
  const styles = new Map<string, string>()
  for (const styleElement of document.querySelectorAll('style')) {
    const css = styleElement.textContent ?? ''
    for (const match of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
      const declarations = normalizeStyleDeclarations(match[2])
      if (!declarations) continue
      for (const selector of match[1].split(',')) {
        const classMatch = selector.trim().match(/^(?:td|th|tr|table)?\.([A-Za-z_][A-Za-z0-9_-]*)$/i)
        if (classMatch) styles.set(classMatch[1], declarations)
      }
    }
  }
  return styles
}

function materializeElementStyle(element: Element, classStyles: Map<string, string>): void {
  const tag = element.tagName.toLowerCase()
  if (!['table', 'tr', 'th', 'td', 'col', 'span', 'p', 'div', 'strong', 'b', 'em', 'i', 'u'].includes(tag)) return
  const declarations: string[] = []
  for (const className of element.classList) {
    const classStyle = classStyles.get(className)
    if (classStyle) declarations.push(classStyle)
  }
  if (element.getAttribute('bgcolor')) declarations.push(`background-color: ${element.getAttribute('bgcolor')}`)
  if (element.getAttribute('align')) declarations.push(`text-align: ${element.getAttribute('align')}`)
  if (element.getAttribute('valign')) declarations.push(`vertical-align: ${element.getAttribute('valign')}`)
  if (element.getAttribute('width')) declarations.push(`width: ${normalizeLegacyLength(element.getAttribute('width') ?? '')}`)
  if (element.getAttribute('height')) declarations.push(`height: ${normalizeLegacyLength(element.getAttribute('height') ?? '')}`)
  declarations.push(element.getAttribute('style') ?? '')
  const style = normalizeStyleDeclarations(declarations.join(';'))
  if (style) element.setAttribute('style', style)
  else element.removeAttribute('style')
}

function normalizeStyleDeclarations(source: string): string {
  const declarations: string[] = []
  for (const declaration of source.split(';')) {
    const separator = declaration.indexOf(':')
    if (separator <= 0) continue
    let property = declaration.slice(0, separator).trim().toLowerCase()
    let value = declaration.slice(separator + 1).replace(/!important/gi, '').trim()
    if (property === 'background' && /^(?:#[0-9a-f]{3,8}|[a-z]{1,24})$/i.test(value)) property = 'background-color'
    if (!SUPPORTED_STYLE_PROPERTIES.has(property)) continue
    value = value.replace(/\bwindowtext\b/gi, '#000000').replace(/\bwindow\b/gi, '#ffffff')
    if (/url\s*\(|expression\s*\(|javascript:|data:/i.test(value)) continue
    declarations.push(`${property}: ${value}`)
  }
  return sanitizeMailStyle(declarations.join(';'), 'td') ?? ''
}

function replaceLegacyFont(font: Element): void {
  const span = font.ownerDocument.createElement('span')
  const styles: string[] = []
  if (font.getAttribute('face')) styles.push(`font-family: ${font.getAttribute('face')}`)
  if (font.getAttribute('color')) styles.push(`color: ${font.getAttribute('color')}`)
  const size = Number(font.getAttribute('size'))
  if (Number.isInteger(size) && size >= 1 && size <= 7) styles.push(`font-size: ${[10, 13, 16, 18, 24, 32, 48][size - 1]}px`)
  const normalized = normalizeStyleDeclarations(styles.join(';'))
  if (normalized) span.setAttribute('style', normalized)
  span.replaceChildren(...font.childNodes)
  font.replaceWith(span)
}

function removeUnsafeAttributes(element: Element): void {
  const keep = new Set(['style', 'width', 'height', 'colspan', 'rowspan', 'span'])
  for (const attribute of [...element.attributes]) {
    if (!keep.has(attribute.name.toLowerCase())) element.removeAttribute(attribute.name)
  }
}

function boundCellSpans(cell: Element): void {
  for (const name of ['rowspan', 'colspan'] as const) {
    const value = Number(cell.getAttribute(name) ?? '1')
    if (!Number.isInteger(value) || value < 1 || value > 100) cell.removeAttribute(name)
  }
}

function normalizeLegacyLength(value: string): string {
  const trimmed = value.trim()
  return /^\d+(?:\.\d+)?%$/.test(trimmed) ? trimmed : /^\d+(?:\.\d+)?$/.test(trimmed) ? `${trimmed}px` : trimmed
}

function rejectedRichTable(): ClipboardTableResult {
  return { kind: 'rejected', message: 'Excel 表格过大或结构超出安全处理范围，请缩小复制范围后重试。' }
}
