import type { JsonObject, JsonValue, MailTemplate } from '../shared/contracts'
import { sanitizeMailHtml, sanitizeMailTemplateHtml } from '../shared/rich-body'

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*)\s*\}\}/g
export const VARIABLE_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/
export const VARIABLE_ALIAS_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/

export type DynamicRowsResult = {
  html: string
  errors: string[]
  warnings: string[]
  bindingCount: number
  generatedRowCount: number
}

export function expandDynamicRows(source: string, data: JsonObject): DynamicRowsResult {
  const document = parseTemplate(source)
  const errors: string[] = []
  const warnings: string[] = []
  const boundRows = rowsOwnedByTables(document)
  let generatedRowCount = 0

  console.info('[mail-template:dynamic-rows][01] render-start', {
    bindingCount: boundRows.length,
    dataKeyCount: Object.keys(data).length
  })

  for (const table of Array.from(document.querySelectorAll('table'))) {
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr[data-repeat-path]'))
      .filter((row) => row.closest('table') === table)
    if (rows.length <= 1) continue
    errors.push('一张表格只能设置一个动态数据行。')
    rows.forEach((row) => row.remove())
  }

  for (const row of boundRows) {
    if (!row.isConnected) continue
    const path = row.getAttribute('data-repeat-path') ?? ''
    const alias = row.getAttribute('data-repeat-alias') ?? ''
    const validationError = validateBinding(row, path, alias)
    if (validationError) {
      errors.push(validationError)
      row.remove()
      console.info('[mail-template:dynamic-rows][02] binding-resolved', { path, status: 'invalid-binding' })
      continue
    }

    const value = readPath(data, path)
    if (value === undefined || value === null) {
      errors.push(`动态表格数据路径 ${path} 不存在。`)
      row.remove()
      console.info('[mail-template:dynamic-rows][02] binding-resolved', { path, status: 'missing' })
      continue
    }
    if (!Array.isArray(value)) {
      errors.push(`动态表格数据 ${path} 必须是数组。`)
      row.remove()
      console.info('[mail-template:dynamic-rows][02] binding-resolved', { path, status: 'not-array' })
      continue
    }
    if (value.some((entry) => !isJsonObject(entry))) {
      const invalidIndex = value.findIndex((entry) => !isJsonObject(entry))
      errors.push(`${path}[${invalidIndex}] 必须是对象。`)
      row.remove()
      console.info('[mail-template:dynamic-rows][02] binding-resolved', { path, status: 'invalid-item', itemCount: value.length })
      continue
    }

    if (!rowUsesAlias(row, alias)) warnings.push(`动态行 ${path} 没有使用 {{${alias}.*}} 变量，请检查绑定。`)
    if (value.length === 0) {
      warnings.push(`${path} 没有数据。`)
      row.remove()
      console.info('[mail-template:dynamic-rows][02] binding-resolved', { path, status: 'empty', itemCount: 0 })
      continue
    }

    for (const [index, entry] of value.entries()) {
      const clone = row.cloneNode(true) as HTMLTableRowElement
      clone.removeAttribute('data-repeat-path')
      clone.removeAttribute('data-repeat-alias')
      replaceRowVariables(clone, alias, entry as JsonObject, path, index, errors)
      row.before(clone)
      generatedRowCount += 1
    }
    row.remove()
    console.info('[mail-template:dynamic-rows][02] binding-resolved', { path, status: 'expanded', itemCount: value.length })
  }

  const result = {
    html: sanitizeMailHtml(document.body.innerHTML).html,
    errors: unique(errors),
    warnings: unique(warnings),
    bindingCount: boundRows.length,
    generatedRowCount
  }
  console.info('[mail-template:dynamic-rows][03] render-complete', {
    bindingCount: result.bindingCount,
    generatedRowCount,
    errorCount: result.errors.length,
    warningCount: result.warnings.length
  })
  return result
}

export function buildTemplateDataExample(template: MailTemplate): JsonObject {
  const document = parseTemplate(template.bodyHtml)
  const example: JsonObject = {}
  const sources = [template.to, template.cc, template.bcc, template.subject]
  for (const source of sources) addGlobalVariables(example, source)

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const row = node.parentElement?.closest<HTMLTableRowElement>('tr[data-repeat-path]') ?? null
    if (row) {
      const path = row.getAttribute('data-repeat-path') ?? ''
      const alias = row.getAttribute('data-repeat-alias') ?? ''
      const item: JsonObject = readExampleItem(example, path)
      for (const variable of extractVariables(node.textContent ?? '')) {
        if (variable.startsWith(`${alias}.`)) assignPath(item, variable.slice(alias.length + 1), '')
        else assignPath(example, variable, '')
      }
      if (VARIABLE_PATH_PATTERN.test(path)) assignPath(example, path, [item])
    } else {
      addGlobalVariables(example, node.textContent ?? '')
    }
    node = walker.nextNode()
  }
  return example
}

export function suggestRowAlias(path: string): string {
  const name = path.split('.').filter(Boolean).at(-1) ?? 'item'
  return name.endsWith('ies') && name.length > 3
    ? `${name.slice(0, -3)}y`
    : name.endsWith('s') && name.length > 1
      ? name.slice(0, -1)
      : `${name}Item`
}

function parseTemplate(source: string): Document {
  const sanitized = sanitizeMailTemplateHtml(source).html
  return new DOMParser().parseFromString(`<body>${sanitized}</body>`, 'text/html')
}

function rowsOwnedByTables(document: Document): HTMLTableRowElement[] {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>('tr[data-repeat-path]'))
}

function validateBinding(row: HTMLTableRowElement, path: string, alias: string): string | null {
  if (!VARIABLE_PATH_PATTERN.test(path)) return '动态数据数组路径格式无效。'
  if (!VARIABLE_ALIAS_PATTERN.test(alias)) return `动态数据 ${path} 的行别名格式无效。`
  if (Array.from(row.cells).some((cell) => cell.rowSpan > 1)) return `动态行 ${path} 不能包含跨行合并单元格，请先拆分。`
  return null
}

function replaceRowVariables(row: HTMLTableRowElement, alias: string, item: JsonObject, path: string, index: number, errors: string[]): void {
  const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    node.textContent = (node.textContent ?? '').replace(VARIABLE_PATTERN, (token, variable: string) => {
      if (!variable.startsWith(`${alias}.`)) return token
      const itemPath = variable.slice(alias.length + 1)
      const value = readPath(item, itemPath)
      if (value === undefined || value === null) {
        const location = `${path}[${index}].${itemPath}`
        errors.push(`${location} 缺少值。`)
        return `〔缺少 ${location}〕`
      }
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
    })
    node = walker.nextNode()
  }
}

function rowUsesAlias(row: HTMLTableRowElement, alias: string): boolean {
  return extractVariables(row.textContent ?? '').some((variable) => variable.startsWith(`${alias}.`))
}

function addGlobalVariables(target: JsonObject, source: string): void {
  for (const variable of extractVariables(source)) assignPath(target, variable, '')
}

function extractVariables(source: string): string[] {
  return [...new Set(Array.from(source.matchAll(VARIABLE_PATTERN), (match) => match[1]))]
}

function readExampleItem(example: JsonObject, path: string): JsonObject {
  const existing = readPath(example, path)
  if (Array.isArray(existing) && isJsonObject(existing[0])) return existing[0]
  return {}
}

function assignPath(target: JsonObject, path: string, value: JsonValue): void {
  if (!VARIABLE_PATH_PATTERN.test(path)) return
  const segments = path.split('.')
  let current = target
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment]
    if (!isJsonObject(existing)) current[segment] = {}
    current = current[segment] as JsonObject
  }
  const key = segments.at(-1)
  if (key && current[key] === undefined) current[key] = value
  else if (key && Array.isArray(value)) current[key] = value
}

function readPath(source: JsonValue, path: string): JsonValue | undefined {
  let current: JsonValue = source
  for (const segment of path.split('.')) {
    if (!isJsonObject(current) || !Object.hasOwn(current, segment)) return undefined
    current = current[segment]
  }
  return current
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
