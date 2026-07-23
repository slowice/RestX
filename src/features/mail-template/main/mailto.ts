import { MAIL_TEMPLATE_LIMITS, type MailDraft } from '../shared/contracts'
import { readMailDraft } from '../shared/template-engine'

export function buildMailtoUri(input: unknown): string {
  const draft = readMailDraft(input)
  const query: string[] = []
  appendQuery(query, 'cc', draft.cc.join(','))
  appendQuery(query, 'bcc', draft.bcc.join(','))
  appendQuery(query, 'subject', draft.subject)
  appendQuery(query, 'body', draft.body)
  const uri = `mailto:${encodeRecipients(draft.to)}?${query.join('&')}`
  if (uri.length > MAIL_TEMPLATE_LIMITS.mailtoUri) throw new Error('邮件内容较长，无法直接打开邮件客户端，请先精简正文。')
  return uri
}

function appendQuery(query: string[], name: keyof Pick<MailDraft, 'cc' | 'bcc' | 'subject' | 'body'>, value: string): void {
  if (value) query.push(`${name}=${encodeURIComponent(value)}`)
}

function encodeRecipients(recipients: string[]): string {
  return recipients.map((recipient) => encodeURIComponent(recipient)).join(',')
}
