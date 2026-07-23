export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }

export type MailTemplate = {
  id: string
  name: string
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  defaults: JsonObject
  updatedAt: string
}

export type MailDraft = {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
}

export type ImportedMailMessage = {
  sourceName: string
  format: 'eml' | 'msg'
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  attachmentCount: number
  warnings: string[]
}

export type MailValidationIssue = {
  code: 'missing-recipient' | 'invalid-recipient' | 'missing-variable' | 'empty-subject' | 'empty-body' | 'field-too-long'
  field: 'to' | 'cc' | 'bcc' | 'subject' | 'body' | 'template'
  message: string
  value?: string
}

export type RenderedMailTemplate = {
  draft: MailDraft
  missingVariables: string[]
  issues: MailValidationIssue[]
}

export type MailTemplateApi = {
  mailTemplates: {
    openDraft(draft: MailDraft): Promise<void>
    importMessage(): Promise<ImportedMailMessage | null>
  }
}

export const MAIL_TEMPLATE_LIMITS = {
  name: 80,
  recipientField: 2_000,
  recipientCount: 100,
  subject: 998,
  body: 12_000,
  mailtoUri: 24_000,
  importFileBytes: 25 * 1024 * 1024,
  sourceName: 255
} as const
