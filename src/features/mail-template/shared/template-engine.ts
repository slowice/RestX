import {
  MAIL_TEMPLATE_LIMITS,
  type JsonObject,
  type JsonValue,
  type MailDraft,
  type MailTemplate,
  type MailValidationIssue,
  type RenderedMailTemplate
} from './contracts'

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*)\s*\}\}/g
const EMAIL_PATTERN = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export type JsonObjectParseResult =
  | { ok: true; value: JsonObject }
  | { ok: false; error: string }

export function parseJsonObject(source: string): JsonObjectParseResult {
  try {
    const parsed: unknown = JSON.parse(source.trim() || '{}')
    if (!isJsonObject(parsed)) return { ok: false, error: 'JSON 最外层必须是一个对象，例如 {"project":"RestX"}。' }
    return { ok: true, value: sanitizeObject(parsed) }
  } catch (reason) {
    const detail = reason instanceof SyntaxError ? reason.message : '无法解析 JSON'
    return { ok: false, error: `JSON 格式有误：${detail}` }
  }
}

export function mergeJsonObjects(defaults: JsonObject, overrides: JsonObject): JsonObject {
  const entries = new Map<string, JsonValue>()
  for (const [key, value] of Object.entries(defaults)) {
    if (!FORBIDDEN_KEYS.has(key)) entries.set(key, cloneJsonValue(value))
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (FORBIDDEN_KEYS.has(key)) continue
    const current = entries.get(key)
    entries.set(key, isJsonObject(current) && isJsonObject(value)
      ? mergeJsonObjects(current, value)
      : cloneJsonValue(value))
  }
  return Object.fromEntries(entries)
}

export function extractPlaceholders(source: string): string[] {
  return [...new Set(Array.from(source.matchAll(PLACEHOLDER_PATTERN), (match) => match[1]))]
}

export function renderTemplateText(source: string, data: JsonObject): { value: string; missing: string[] } {
  const missing = new Set<string>()
  const value = source.replace(PLACEHOLDER_PATTERN, (token, path: string) => {
    const resolved = readPath(data, path)
    if (resolved === undefined || resolved === null) {
      missing.add(path)
      return token
    }
    if (typeof resolved === 'object') return JSON.stringify(resolved)
    return String(resolved)
  })
  return { value, missing: [...missing] }
}

export function parseRecipientList(source: string): string[] {
  return source.split(/[;,\n]+/).map((value) => value.trim()).filter(Boolean)
}

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value)
}

export function renderMailTemplate(template: MailTemplate, perSendData: JsonObject): RenderedMailTemplate {
  const data = mergeJsonObjects(template.defaults, perSendData)
  const fields = {
    to: renderTemplateText(template.to, data),
    cc: renderTemplateText(template.cc, data),
    bcc: renderTemplateText(template.bcc, data),
    subject: renderTemplateText(template.subject, data),
    body: renderTemplateText(template.body, data)
  }
  const missingVariables = [...new Set(Object.values(fields).flatMap((field) => field.missing))].sort()
  const draft: MailDraft = {
    to: parseRecipientList(fields.to.value),
    cc: parseRecipientList(fields.cc.value),
    bcc: parseRecipientList(fields.bcc.value),
    subject: fields.subject.value,
    body: fields.body.value
  }
  const issues = validateMailDraft(draft)
  for (const variable of missingVariables) {
    issues.unshift({ code: 'missing-variable', field: 'template', value: variable, message: `变量 {{${variable}}} 还没有值。` })
  }
  return { draft, missingVariables, issues }
}

export function validateMailDraft(draft: MailDraft): MailValidationIssue[] {
  const issues: MailValidationIssue[] = []
  if (draft.to.length === 0) issues.push({ code: 'missing-recipient', field: 'to', message: '至少需要填写一个收件人。' })

  for (const field of ['to', 'cc', 'bcc'] as const) {
    if (draft[field].length > MAIL_TEMPLATE_LIMITS.recipientCount) {
      issues.push({ code: 'field-too-long', field, message: `${recipientLabel(field)}不能超过 ${MAIL_TEMPLATE_LIMITS.recipientCount} 个地址。` })
    }
    for (const recipient of draft[field]) {
      if (!isValidEmailAddress(recipient)) {
        issues.push({ code: 'invalid-recipient', field, value: recipient, message: `${recipientLabel(field)}中存在无效邮箱地址：${recipient}` })
      }
    }
  }

  if (!draft.subject.trim()) issues.push({ code: 'empty-subject', field: 'subject', message: '邮件标题不能为空。' })
  if (!draft.body.trim()) issues.push({ code: 'empty-body', field: 'body', message: '邮件正文不能为空。' })
  if (draft.subject.length > MAIL_TEMPLATE_LIMITS.subject) issues.push({ code: 'field-too-long', field: 'subject', message: `邮件标题不能超过 ${MAIL_TEMPLATE_LIMITS.subject} 个字符。` })
  if (draft.body.length > MAIL_TEMPLATE_LIMITS.body) issues.push({ code: 'field-too-long', field: 'body', message: `邮件正文不能超过 ${MAIL_TEMPLATE_LIMITS.body} 个字符。` })
  return issues
}

export function validateMailTemplate(template: MailTemplate): string[] {
  const errors: string[] = []
  if (!template.name.trim()) errors.push('模板名称不能为空。')
  if (template.name.length > MAIL_TEMPLATE_LIMITS.name) errors.push(`模板名称不能超过 ${MAIL_TEMPLATE_LIMITS.name} 个字符。`)
  if (!template.to.trim()) errors.push('收件人模板不能为空。')
  if (!template.subject.trim()) errors.push('标题模板不能为空。')
  if (!template.body.trim()) errors.push('正文模板不能为空。')
  for (const [label, value] of [['收件人', template.to], ['抄送', template.cc], ['密送', template.bcc]] as const) {
    if (value.length > MAIL_TEMPLATE_LIMITS.recipientField) errors.push(`${label}内容过长。`)
  }
  if (template.subject.length > MAIL_TEMPLATE_LIMITS.subject) errors.push(`标题模板不能超过 ${MAIL_TEMPLATE_LIMITS.subject} 个字符。`)
  if (template.body.length > MAIL_TEMPLATE_LIMITS.body) errors.push(`正文模板不能超过 ${MAIL_TEMPLATE_LIMITS.body} 个字符。`)
  return errors
}

export function readMailDraft(value: unknown): MailDraft {
  if (!value || typeof value !== 'object') throw new Error('邮件草稿参数无效。')
  const input = value as Record<string, unknown>
  const draft: MailDraft = {
    to: readStringArray(input.to, '收件人'),
    cc: readStringArray(input.cc, '抄送'),
    bcc: readStringArray(input.bcc, '密送'),
    subject: readBoundedString(input.subject, '标题', MAIL_TEMPLATE_LIMITS.subject),
    body: readBoundedString(input.body, '正文', MAIL_TEMPLATE_LIMITS.body)
  }
  const issues = validateMailDraft(draft)
  if (issues.length > 0) throw new Error(issues[0].message)
  return draft
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${label}参数无效。`)
  if (value.length > MAIL_TEMPLATE_LIMITS.recipientCount) throw new Error(`${label}数量过多。`)
  return value.map((item) => readBoundedString(item, label, 320))
}

function readBoundedString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum) throw new Error(`${label}参数无效。`)
  return value
}

function readPath(data: JsonObject, path: string): JsonValue | undefined {
  let current: JsonValue = data
  for (const segment of path.split('.')) {
    if (FORBIDDEN_KEYS.has(segment) || !isJsonObject(current) || !Object.hasOwn(current, segment)) return undefined
    current = current[segment]
  }
  return current
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeObject(value: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !FORBIDDEN_KEYS.has(key))
    .map(([key, entry]) => [key, sanitizeValue(entry)]))
}

function sanitizeValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (isJsonObject(value)) return sanitizeObject(value)
  return value
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue)
  if (isJsonObject(value)) return sanitizeObject(value)
  return value
}

function recipientLabel(field: 'to' | 'cc' | 'bcc'): string {
  return { to: '收件人', cc: '抄送', bcc: '密送' }[field]
}
