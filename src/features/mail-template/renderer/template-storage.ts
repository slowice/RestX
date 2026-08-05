import type { JsonObject, MailTemplate } from '../shared/contracts'
import { mailHtmlToText, plainTextToMailHtml, sanitizeMailHtml } from '../shared/rich-body'

export const MAIL_TEMPLATE_STORAGE_KEY = 'restx:mail-template:library:v2'
export const LEGACY_MAIL_TEMPLATE_STORAGE_KEY = 'restx:mail-template:library:v1'

type TemplateEnvelopeV2 = { version: 2; templates: MailTemplate[] }
type LegacyMailTemplate = Omit<MailTemplate, 'bodyHtml' | 'bodyText'> & { body: string }
type TemplateEnvelopeV1 = { version: 1; templates: LegacyMailTemplate[] }
type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export type MailTemplateLibrary = {
  templates: MailTemplate[]
  migrated: boolean
  error: string | null
}

export function loadMailTemplateLibrary(storage: KeyValueStorage): MailTemplateLibrary {
  const current = storage.getItem(MAIL_TEMPLATE_STORAGE_KEY)
  if (current !== null) return readV2Library(current)
  const legacy = storage.getItem(LEGACY_MAIL_TEMPLATE_STORAGE_KEY)
  if (legacy !== null) return readV1Library(legacy)
  return { templates: createSeedTemplates(), migrated: false, error: null }
}

export function loadMailTemplates(storage: KeyValueStorage): MailTemplate[] {
  return loadMailTemplateLibrary(storage).templates
}

export function saveMailTemplates(storage: KeyValueStorage, templates: MailTemplate[]): void {
  const envelope: TemplateEnvelopeV2 = { version: 2, templates: templates.map(copyTemplate) }
  storage.setItem(MAIL_TEMPLATE_STORAGE_KEY, JSON.stringify(envelope))
}

export function createBlankTemplate(now = new Date()): MailTemplate {
  return createRichTemplate({
    id: createTemplateId(), name: '未命名模板', to: '', cc: '', bcc: '', subject: '', bodyText: '', defaults: {}, updatedAt: now.toISOString()
  })
}

export function duplicateMailTemplate(source: MailTemplate, now = new Date()): MailTemplate {
  return { ...copyTemplate(source), id: createTemplateId(), name: `${source.name} - 副本`, updatedAt: now.toISOString() }
}

export function createSeedTemplates(): MailTemplate[] {
  return [
    createRichTemplate({
      id: 'weekly-report', name: '项目周报', to: '{{managerEmail}}', cc: 'team@example.com', bcc: '', subject: '【{{projectName}}】{{week}}周报',
      bodyText: '{{managerName}}，您好：\n\n{{summary}}\n\n当前进度：{{progress}}%\n风险：{{risk}}\n\n谢谢。',
      defaults: { managerEmail: 'manager@example.com', managerName: '负责人', projectName: '示例项目', week: '本周', summary: '本周工作正常推进。', progress: 0, risk: '暂无' },
      updatedAt: '2026-01-01T00:00:00.000Z'
    }),
    createRichTemplate({
      id: 'meeting-notice', name: '会议通知', to: '{{recipientEmail}}', cc: '', bcc: '', subject: '会议通知：{{topic}}',
      bodyText: '您好：\n\n邀请您参加“{{topic}}”会议。\n时间：{{meetingTime}}\n地点：{{location}}\n\n请准时参加，谢谢。',
      defaults: { recipientEmail: 'colleague@example.com', topic: '项目沟通会', meetingTime: '明天 10:00', location: '线上会议' },
      updatedAt: '2026-01-01T00:00:00.000Z'
    })
  ]
}

function readV2Library(raw: string): MailTemplateLibrary {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isTemplateEnvelopeV2(parsed)) return invalidLibrary('邮件模板存储格式无效，原始数据已保留。')
    return { templates: parsed.templates.map(copyTemplate), migrated: false, error: null }
  } catch {
    return invalidLibrary('邮件模板存储无法解析，原始数据已保留。')
  }
}

function readV1Library(raw: string): MailTemplateLibrary {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isTemplateEnvelopeV1(parsed)) return invalidLibrary('旧版邮件模板格式无效，原始数据已保留。')
    return { templates: parsed.templates.map(migrateLegacyTemplate), migrated: true, error: null }
  } catch {
    return invalidLibrary('旧版邮件模板无法解析，原始数据已保留。')
  }
}

function invalidLibrary(error: string): MailTemplateLibrary {
  return { templates: [], migrated: false, error }
}

function migrateLegacyTemplate(template: LegacyMailTemplate): MailTemplate {
  const { body, ...fields } = template
  return createRichTemplate({ ...fields, bodyText: body })
}

function createRichTemplate(fields: Omit<MailTemplate, 'bodyHtml' | 'bodyText'> & { bodyText: string }): MailTemplate {
  const bodyHtml = plainTextToMailHtml(fields.bodyText)
  return { ...fields, bodyHtml, bodyText: mailHtmlToText(bodyHtml) }
}

function isTemplateEnvelopeV2(value: unknown): value is TemplateEnvelopeV2 {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Partial<TemplateEnvelopeV2>
  return envelope.version === 2 && Array.isArray(envelope.templates) && envelope.templates.every(isMailTemplate)
}

function isTemplateEnvelopeV1(value: unknown): value is TemplateEnvelopeV1 {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Partial<TemplateEnvelopeV1>
  return envelope.version === 1 && Array.isArray(envelope.templates) && envelope.templates.every(isLegacyMailTemplate)
}

function hasCommonTemplateFields(input: Record<string, unknown>): boolean {
  return ['id', 'name', 'to', 'cc', 'bcc', 'subject', 'updatedAt'].every((key) => typeof input[key] === 'string') && isJsonObject(input.defaults)
}

function isMailTemplate(value: unknown): value is MailTemplate {
  if (!value || typeof value !== 'object') return false
  const input = value as Record<string, unknown>
  if (!hasCommonTemplateFields(input) || typeof input.bodyHtml !== 'string' || typeof input.bodyText !== 'string') return false
  const sanitized = sanitizeMailHtml(input.bodyHtml)
  return !sanitized.changed && mailHtmlToText(sanitized.html) === input.bodyText
}

function isLegacyMailTemplate(value: unknown): value is LegacyMailTemplate {
  return Boolean(value && typeof value === 'object' && hasCommonTemplateFields(value as Record<string, unknown>) && typeof (value as Record<string, unknown>).body === 'string')
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function copyTemplate(template: MailTemplate): MailTemplate {
  const bodyHtml = sanitizeMailHtml(template.bodyHtml).html
  return { ...template, bodyHtml, bodyText: mailHtmlToText(bodyHtml), defaults: JSON.parse(JSON.stringify(template.defaults)) as JsonObject }
}

function createTemplateId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `mail-${random}`
}
