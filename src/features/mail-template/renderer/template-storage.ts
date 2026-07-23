import type { JsonObject, MailTemplate } from '../shared/contracts'

export const MAIL_TEMPLATE_STORAGE_KEY = 'restx:mail-template:library:v1'

type TemplateEnvelope = {
  version: 1
  templates: MailTemplate[]
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export function loadMailTemplates(storage: KeyValueStorage): MailTemplate[] {
  const raw = storage.getItem(MAIL_TEMPLATE_STORAGE_KEY)
  if (!raw) return createSeedTemplates()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isTemplateEnvelope(parsed)) return createSeedTemplates()
    return parsed.templates.map(copyTemplate)
  } catch {
    return createSeedTemplates()
  }
}

export function saveMailTemplates(storage: KeyValueStorage, templates: MailTemplate[]): void {
  const envelope: TemplateEnvelope = { version: 1, templates: templates.map(copyTemplate) }
  storage.setItem(MAIL_TEMPLATE_STORAGE_KEY, JSON.stringify(envelope))
}

export function createBlankTemplate(now = new Date()): MailTemplate {
  return {
    id: createTemplateId(),
    name: '未命名模板',
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    defaults: {},
    updatedAt: now.toISOString()
  }
}

export function duplicateMailTemplate(source: MailTemplate, now = new Date()): MailTemplate {
  return {
    ...copyTemplate(source),
    id: createTemplateId(),
    name: `${source.name} - 副本`,
    updatedAt: now.toISOString()
  }
}

export function createSeedTemplates(): MailTemplate[] {
  return [
    {
      id: 'weekly-report',
      name: '项目周报',
      to: '{{managerEmail}}',
      cc: 'team@example.com',
      bcc: '',
      subject: '【{{projectName}}】{{week}}周报',
      body: '{{managerName}}，您好：\n\n{{summary}}\n\n当前进度：{{progress}}%\n风险：{{risk}}\n\n谢谢。',
      defaults: {
        managerEmail: 'manager@example.com',
        managerName: '负责人',
        projectName: '示例项目',
        week: '本周',
        summary: '本周工作正常推进。',
        progress: 0,
        risk: '暂无'
      },
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'meeting-notice',
      name: '会议通知',
      to: '{{recipientEmail}}',
      cc: '',
      bcc: '',
      subject: '会议通知：{{topic}}',
      body: '您好：\n\n邀请您参加“{{topic}}”会议。\n时间：{{meetingTime}}\n地点：{{location}}\n\n请准时参加，谢谢。',
      defaults: {
        recipientEmail: 'colleague@example.com',
        topic: '项目沟通会',
        meetingTime: '明天 10:00',
        location: '线上会议'
      },
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
  ]
}

function isTemplateEnvelope(value: unknown): value is TemplateEnvelope {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Partial<TemplateEnvelope>
  return envelope.version === 1 && Array.isArray(envelope.templates) && envelope.templates.every(isMailTemplate)
}

function isMailTemplate(value: unknown): value is MailTemplate {
  if (!value || typeof value !== 'object') return false
  const input = value as Partial<MailTemplate>
  return ['id', 'name', 'to', 'cc', 'bcc', 'subject', 'body', 'updatedAt'].every((key) => typeof input[key as keyof MailTemplate] === 'string')
    && isJsonObject(input.defaults)
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function copyTemplate(template: MailTemplate): MailTemplate {
  return { ...template, defaults: JSON.parse(JSON.stringify(template.defaults)) as JsonObject }
}

function createTemplateId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `mail-${random}`
}
