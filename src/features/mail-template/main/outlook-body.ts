import sanitizeHtml from 'sanitize-html'
import { sanitizeMailHtml } from '../shared/rich-body'

// Outlook does not receive the renderer stylesheet. Inline its table defaults
// before the source styles so explicit borders (including none) still win.
export function prepareOutlookBody(source: string): string {
  const defaults: Record<string, string> = {
    table: 'border-collapse:collapse',
    td: 'border:1px solid #b8b8b8;padding:4px;vertical-align:middle',
    th: 'border:1px solid #b8b8b8;padding:4px;vertical-align:middle;background-color:#f4f4f4;font-weight:700'
  }
  return sanitizeHtml(sanitizeMailHtml(source).html, {
    allowedTags: false,
    allowedAttributes: false,
    allowedSchemes: ['data'],
    parseStyleAttributes: false,
    transformTags: {
      '*': (tagName, attribs) => ({
        tagName,
        attribs: defaults[tagName]
          ? { ...attribs, style: `${defaults[tagName]};${attribs.style ?? ''}` }
          : attribs
      })
    }
  })
}
