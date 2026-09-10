import MsgReader, { type FieldsData } from '@kenjiuno/msgreader'
import { simpleParser, type AddressObject } from 'mailparser'
import path from 'node:path'
import { MAIL_TEMPLATE_LIMITS, type ImportedMailMessage } from '../shared/contracts'
import { isValidEmailAddress } from '../shared/template-engine'
import { mailHtmlToText } from '../shared/rich-body'
import { importRichBody, type InlineMailImage } from './import-rich-body'

type FileStat = { size: number; isFile(): boolean }
type MsgReaderConstructor = new (arrayBuffer: ArrayBuffer | DataView) => { getFileData(): FieldsData; getAttachment(attachment: FieldsData): { content: Uint8Array } }

export type MessageImportDependencies = {
  selectFile(): Promise<string | null>
  stat(filePath: string): Promise<FileStat>
  readFile(filePath: string): Promise<Buffer>
}

export async function importOutlookMessage(dependencies: MessageImportDependencies): Promise<ImportedMailMessage | null> {
  const filePath = await dependencies.selectFile()
  if (!filePath) return null
  const format = readFormat(filePath)
  const stat = await dependencies.stat(filePath).catch(() => { throw new Error('无法读取所选邮件文件。') })
  if (!stat.isFile()) throw new Error('请选择一个 Outlook 邮件文件。')
  if (stat.size <= 0) throw new Error('所选邮件文件为空。')
  if (stat.size > MAIL_TEMPLATE_LIMITS.importFileBytes) throw new Error('邮件文件不能超过 25 MB。')
  const buffer = await dependencies.readFile(filePath).catch(() => { throw new Error('无法读取所选邮件文件。') })
  if (buffer.length === 0 || buffer.length > MAIL_TEMPLATE_LIMITS.importFileBytes) throw new Error('邮件文件大小无效。')
  return parseOutlookMessage(buffer, format, path.basename(filePath))
}

export async function parseOutlookMessage(buffer: Buffer, format: 'eml' | 'msg', sourceName: string): Promise<ImportedMailMessage> {
  try {
    return format === 'eml'
      ? await parseEmlMessage(buffer, sourceName)
      : parseMsgMessage(buffer, sourceName)
  } catch (reason) {
    if (reason instanceof Error && /^导入/.test(reason.message)) throw reason
    throw new Error(`导入失败：无法解析该 ${format.toUpperCase()} 文件，请确认它是由 Outlook 导出的完整邮件。`)
  }
}

async function parseEmlMessage(buffer: Buffer, sourceName: string): Promise<ImportedMailMessage> {
  const parsed = await simpleParser(buffer, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true })
  const warnings: string[] = []
  const bodyHtml = typeof parsed.html === 'string' ? importRichBody(parsed.html, parsed.attachments
    .filter((attachment) => Boolean(attachment.contentId))
    .map((attachment) => ({ id: attachment.contentId!, content: attachment.content, contentType: attachment.contentType })), warnings) : undefined
  const body = cleanText(parsed.text || (typeof parsed.html === 'string' ? htmlToPlainText(parsed.html) : ''))
  return finalizeImportedMessage({
    sourceName,
    format: 'eml',
    to: formatEmlAddresses(parsed.to),
    cc: formatEmlAddresses(parsed.cc),
    bcc: formatEmlAddresses(parsed.bcc),
    subject: parsed.subject ?? '',
    body,
    bodyHtml,
    attachmentCount: parsed.attachments.length,
    warnings
  })
}

function parseMsgMessage(buffer: Buffer, sourceName: string): ImportedMailMessage {
  const arrayBuffer = Uint8Array.from(buffer).buffer
  const MessageReader = resolveMsgReaderConstructor(MsgReader)
  const reader = new MessageReader(arrayBuffer)
  const fields = reader.getFileData()
  if (fields.error) throw new Error('导入失败：MSG 文件内容无效。')
  const images: InlineMailImage[] = []
  for (const attachment of fields.attachments ?? []) {
    if (!attachment.pidContentId) continue
    try {
      images.push({ id: attachment.pidContentId, content: reader.getAttachment(attachment).content,
        contentType: attachment.attachMimeTag ?? imageMimeType(attachment.fileName ?? '') })
    } catch { /* Missing image data is reported when resolving the HTML reference. */ }
  }
  return normalizeMsgFields(fields, sourceName, images)
}

export function resolveMsgReaderConstructor(value: unknown): MsgReaderConstructor {
  if (typeof value === 'function') return value as MsgReaderConstructor
  if (value && typeof value === 'object' && 'default' in value && typeof value.default === 'function') {
    return value.default as MsgReaderConstructor
  }
  throw new Error('导入失败：MSG 解析组件加载失败。')
}

export function normalizeMsgFields(fields: FieldsData, sourceName: string, images: InlineMailImage[] = []): ImportedMailMessage {
  const recipients = fields.recipients ?? []
  const html = fields.bodyHtml ?? decodeMsgHtml(fields)
  const warnings: string[] = []
  const bodyHtml = html ? importRichBody(html, images, warnings) : undefined
  const body = cleanText(fields.body || (html ? htmlToPlainText(html) : ''))
  return finalizeImportedMessage({
    sourceName,
    format: 'msg',
    to: formatMsgRecipients(recipients, 'to'),
    cc: formatMsgRecipients(recipients, 'cc'),
    bcc: formatMsgRecipients(recipients, 'bcc'),
    subject: fields.subject ?? '',
    body,
    bodyHtml,
    attachmentCount: fields.attachments?.length ?? 0,
    warnings
  })
}

function finalizeImportedMessage(message: ImportedMailMessage): ImportedMailMessage {
  const warnings = [...message.warnings]
  const result: ImportedMailMessage = {
    ...message,
    sourceName: truncate(message.sourceName, MAIL_TEMPLATE_LIMITS.sourceName, '文件名', warnings),
    to: truncate(message.to, MAIL_TEMPLATE_LIMITS.recipientField, '收件人', warnings),
    cc: truncate(message.cc, MAIL_TEMPLATE_LIMITS.recipientField, '抄送', warnings),
    bcc: truncate(message.bcc, MAIL_TEMPLATE_LIMITS.recipientField, '密送', warnings),
    subject: truncate(cleanLine(message.subject), MAIL_TEMPLATE_LIMITS.subject, '标题', warnings),
    body: truncate(message.bodyHtml ? mailHtmlToText(message.bodyHtml) : cleanText(message.body), MAIL_TEMPLATE_LIMITS.body, '正文', warnings),
    warnings
  }
  if (!result.subject && !result.body && !result.bodyHtml?.includes('<img ')) throw new Error('导入失败：邮件中没有可用的标题或正文。')
  if (result.attachmentCount > 0) warnings.push(`检测到 ${result.attachmentCount} 个附件，已尝试导入正文引用的内嵌图片，独立附件不随模板保存。`)
  if (!result.to) warnings.push('没有识别到可用的收件人邮箱，请在保存前补充。')
  return result
}

function readFormat(filePath: string): 'eml' | 'msg' {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.eml') return 'eml'
  if (extension === '.msg') return 'msg'
  throw new Error('仅支持 Outlook 导出的 .eml 或 .msg 文件。')
}

function imageMimeType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase()
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' } as Record<string, string>)[extension] ?? ''
}

function decodeMsgHtml(fields: FieldsData): string {
  if (!fields.html) return ''
  const bytes = fields.html
  const header = Buffer.from(bytes).subarray(0, 2048).toString('ascii')
  const charset = header.match(/charset\s*=\s*["']?\s*([\w-]+)/i)?.[1]
  const codepages: Record<number, string> = { 65001: 'utf-8', 1200: 'utf-16le', 936: 'gbk', 950: 'big5', 932: 'shift_jis' }
  try { return new TextDecoder(charset ?? codepages[fields.internetCodepage ?? 65001] ?? `windows-${fields.internetCodepage}`).decode(bytes) }
  catch { return Buffer.from(bytes).toString('utf8') }
}

function formatEmlAddresses(value: AddressObject | AddressObject[] | undefined): string {
  const objects = !value ? [] : Array.isArray(value) ? value : [value]
  return unique(objects.flatMap((object) => object.value
    .map((address) => address.address)
    .filter((address): address is string => typeof address === 'string')
    .map((address) => address.trim())
    .filter(isValidEmailAddress))).join('\n')
}

function formatMsgRecipients(recipients: FieldsData[], type: 'to' | 'cc' | 'bcc'): string {
  const values = recipients.filter((recipient) => recipient.recipType === type).map((recipient) => {
    const candidates = [recipient.smtpAddress, recipient.email, recipient.name]
    return candidates.find((candidate): candidate is string => typeof candidate === 'string' && isValidEmailAddress(candidate.trim()))?.trim()
      ?? candidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)?.trim()
      ?? ''
  }).filter(Boolean)
  return unique(values).join('\n')
}

function htmlToPlainText(html: string): string {
  const withoutUnsafeBlocks = html
    .replace(/<(script|style|head|svg|canvas|iframe|object)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
  return decodeHtmlEntities(withoutUnsafeBlocks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ''))
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return value
    .replace(/&#(\d+);/g, (_token, digits: string) => codePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_token, digits: string) => codePoint(Number.parseInt(digits, 16)))
    .replace(/&([a-z]+);/gi, (token, name: string) => named[name.toLowerCase()] ?? token)
}

function codePoint(value: number): string {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ''
}

function cleanText(value: string): string {
  return value.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

function cleanLine(value: string): string {
  return value.replace(/\u0000/g, '').replace(/[\r\n]+/g, ' ').trim()
}

function truncate(value: string, maximum: number, label: string, warnings: string[]): string {
  if (value.length <= maximum) return value
  warnings.push(`${label}过长，已保留前 ${maximum} 个字符，请保存前检查。`)
  return value.slice(0, maximum)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
