import sanitizeHtml from 'sanitize-html'
import { MAIL_TEMPLATE_LIMITS } from '../shared/contracts'
import { isMailImageSource, sanitizeMailHtml } from '../shared/rich-body'

export type InlineMailImage = { id: string; content: Uint8Array; contentType: string }

export function importRichBody(source: string, images: InlineMailImage[], warnings: string[]): string {
  const imageSources = new Map(images.map((image) => [normalizeContentId(image.id),
    `data:${image.contentType.toLowerCase()};base64,${Buffer.from(image.content).toString('base64')}`]))
  const rules: Array<{ tag?: string; className?: string; style: string }> = []
  for (const block of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const rule of block[1].matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
      for (const selector of rule[1].split(',')) {
        const match = selector.trim().match(/^([a-z][a-z0-9]*)?(?:\.([\w-]+))?$/i)
        if (match) rules.push({ tag: match[1]?.toLowerCase(), className: match[2], style: rule[2] })
      }
    }
  }
  let omittedImages = 0
  const materialized = sanitizeHtml(source, {
    allowedTags: false,
    allowedAttributes: false,
    allowedSchemes: ['data'],
    transformTags: {
      '*': (tag, attributes) => {
        const classes = (attributes.class ?? '').split(/\s+/)
        const styles = rules.filter((rule) => (!rule.tag || rule.tag === tag) && (!rule.className || classes.includes(rule.className))).map((rule) => rule.style)
        for (const [attribute, property] of [['bgcolor', 'background-color'], ['align', 'text-align'], ['valign', 'vertical-align']]) {
          if (attributes[attribute]) styles.push(`${property}:${attributes[attribute]}`)
        }
        for (const size of ['width', 'height']) {
          if (/^\d+(?:\.\d+)?$/.test(attributes[size] ?? '')) styles.push(`${size}:${attributes[size]}px`)
        }
        styles.push(attributes.style ?? '')
        const attribs: Record<string, string> = { ...attributes, style: styles.join(';').replace(/\bwindowtext\b/gi, '#000000').replace(/!important/gi, '') }
        if (tag === 'img') {
          const src = attributes.src ?? ''
          attribs.src = /^cid:/i.test(src) ? imageSources.get(normalizeContentId(src.slice(4))) ?? '' : src
          if (!isMailImageSource(attribs.src)) {
            omittedImages += 1
            return { tagName: 'span', attribs: {} }
          }
        }
        return { tagName: tag, attribs }
      }
    }
  })
  const html = sanitizeMailHtml(materialized).html
  if (html.length > MAIL_TEMPLATE_LIMITS.bodyHtml) throw new Error('导入失败：正文和内嵌图片合计过大，请缩小图片后重试（富文本上限 200 万字符）。')
  if (omittedImages) warnings.push(`${omittedImages} 张图片未导入：图片未嵌入邮件、格式不支持或超过大小限制。`)
  return html
}

function normalizeContentId(value: string): string {
  let decoded = value
  try { decoded = decodeURIComponent(value) } catch { /* Some mail clients use literal percent signs in Content-ID. */ }
  return decoded.trim().replace(/^<|>$/g, '')
}
