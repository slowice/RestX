import { decodeHTML } from 'entities'
import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'p', 'div', 'br', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'mark'
]

const COLOR_VALUE = '(?:#[0-9a-f]{3,8}|rgba?\\(\\s*\\d{1,3}(?:\\s*,\\s*\\d{1,3}){2}(?:\\s*,\\s*(?:0|1|0?\\.\\d+))?\\s*\\)|[a-z]{1,24})'
const COLOR = new RegExp(`^${COLOR_VALUE}$`, 'i')
const LENGTH = /^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|pt|em|rem|%))$/i
const BORDER = new RegExp(`^(?:none|0|(?:(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:px|pt)\\s+)?(?:solid|dashed|dotted|double)\\s+${COLOR_VALUE})$`, 'i')
const BORDER_COLORS = new RegExp(`^${COLOR_VALUE}(?:\\s+${COLOR_VALUE}){0,3}$`, 'i')
const FONT_FAMILY = /^[^;{}()<>]{1,120}$/u

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    '*': ['style'],
    table: ['style', 'width', 'cellpadding', 'cellspacing', 'border'],
    col: ['style', 'width', 'span'],
    th: ['style', 'width', 'height', 'colspan', 'rowspan', 'colwidth'],
    td: ['style', 'width', 'height', 'colspan', 'rowspan', 'colwidth'],
    mark: ['data-missing-variable']
  },
  allowedStyles: {
    '*': {
      color: [COLOR],
      'background-color': [COLOR],
      'font-family': [FONT_FAMILY],
      'font-size': [LENGTH],
      'font-weight': [/^(?:normal|bold|bolder|lighter|[1-9]00)$/i],
      'font-style': [/^(?:normal|italic|oblique)$/i],
      'text-decoration': [/^(?:none|underline|line-through)(?:\s+(?:underline|line-through))*$/i],
      'text-align': [/^(?:left|right|center|justify|start|end)$/i],
      'vertical-align': [/^(?:top|middle|bottom|baseline|sub|super)$/i],
      'white-space': [/^(?:normal|nowrap|pre|pre-wrap)$/i],
      width: [LENGTH],
      'min-width': [LENGTH],
      'max-width': [LENGTH],
      height: [LENGTH],
      padding: [/^(?:0|\d+(?:\.\d+)?(?:px|pt))(?:\s+(?:0|\d+(?:\.\d+)?(?:px|pt))){0,3}$/i],
      'padding-top': [LENGTH],
      'padding-right': [LENGTH],
      'padding-bottom': [LENGTH],
      'padding-left': [LENGTH],
      border: [BORDER],
      'border-top': [BORDER],
      'border-right': [BORDER],
      'border-bottom': [BORDER],
      'border-left': [BORDER],
      'border-color': [BORDER_COLORS],
      'border-width': [/^(?:0|\d+(?:\.\d+)?(?:px|pt))(?:\s+(?:0|\d+(?:\.\d+)?(?:px|pt))){0,3}$/i],
      'border-style': [/^(?:none|solid|dashed|dotted|double)(?:\s+(?:none|solid|dashed|dotted|double)){0,3}$/i],
      'border-collapse': [/^(?:collapse|separate)$/i],
      'border-spacing': [/^(?:0|\d+(?:\.\d+)?(?:px|pt))(?:\s+(?:0|\d+(?:\.\d+)?(?:px|pt)))?$/i],
      'table-layout': [/^(?:auto|fixed)$/i],
      'line-height': [/^(?:normal|\d+(?:\.\d+)?|\d+(?:\.\d+)?(?:px|pt|em|rem|%))$/i]
    }
  },
  allowedSchemes: [],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  parseStyleAttributes: true,
  enforceHtmlBoundary: true
}

const TEMPLATE_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  ...SANITIZE_OPTIONS,
  allowedAttributes: {
    ...SANITIZE_OPTIONS.allowedAttributes,
    tr: ['style', 'data-repeat-path', 'data-repeat-alias']
  }
}

export type SanitizedMailHtml = { html: string; changed: boolean }

export function sanitizeMailHtml(source: string): SanitizedMailHtml {
  return sanitizeWithOptions(source, SANITIZE_OPTIONS)
}

export function sanitizeMailTemplateHtml(source: string): SanitizedMailHtml {
  return sanitizeWithOptions(source, TEMPLATE_SANITIZE_OPTIONS)
}

function sanitizeWithOptions(source: string, options: sanitizeHtml.IOptions): SanitizedMailHtml {
  const withoutNulls = source.replace(/\u0000/g, '')
  const html = sanitizeHtml(withoutNulls, options).trim()
  return { html, changed: html !== source.trim() }
}

export function plainTextToMailHtml(source: string): string {
  const normalized = source.replace(/\u0000/g, '').replace(/\r\n?/g, '\n')
  if (!normalized) return '<p></p>'
  return normalized.split('\n').map((line) => line
    ? `<p>${escapeHtml(line)}</p>`
    : '<p><br /></p>').join('')
}

export function mailHtmlToText(source: string): string {
  const html = sanitizeMailHtml(source).html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|blockquote|h[1-6])>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, '\t')
    .replace(/<\/tr>/gi, '\n')
  const encodedText = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
  return decodeHTML(encodedText)
    .replace(/\t+\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function mapMailHtmlText(source: string, transform: (text: string) => string): string {
  const sanitized = sanitizeMailHtml(source).html
  return sanitized.split(/(<[^>]+>)/g).map((part) => part.startsWith('<') ? part : transform(part)).join('')
}

export function sanitizeMailStyle(style: string, tag: 'table' | 'tr' | 'th' | 'td' | 'span' = 'span'): string | null {
  if (!style.trim()) return null
  const result = sanitizeMailHtml(`<${tag} style="${escapeHtml(style)}">x</${tag}>`).html
  const match = result.match(/\sstyle="([^"]+)"/i)
  return match ? decodeHTML(match[1]) : null
}

export function highlightMissingVariables(source: string, variables: string[]): string {
  if (variables.length === 0) return sanitizeMailHtml(source).html
  const missing = new Set(variables)
  return mapMailHtmlText(source, (text) => text.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*)\s*\}\}/g,
    (token, path: string) => missing.has(path)
      ? `<mark data-missing-variable="${escapeHtml(path)}">${escapeHtml(token)}</mark>`
      : token
  ))
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
