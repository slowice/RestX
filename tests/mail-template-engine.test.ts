import { describe, expect, it } from 'vitest'
import type { MailTemplate } from '../src/features/mail-template/shared/contracts'
import {
  extractPlaceholders,
  mergeJsonObjects,
  parseJsonObject,
  readMailDraft,
  renderMailTemplate,
  renderTemplateText
} from '../src/features/mail-template/shared/template-engine'

const template: MailTemplate = {
  id: 'weekly', name: '周报', to: '{{owner.email}}', cc: 'team@example.com', bcc: '',
  subject: '【{{project}}】{{week}}周报',
  body: '{{owner.name}}，您好。\n进度：{{progress}}%\n风险：{{risk}}',
  defaults: { project: '默认项目', week: '本周', owner: { name: '默认负责人', email: 'owner@example.com' }, progress: 0, risk: '暂无' },
  updatedAt: '2026-01-01T00:00:00.000Z'
}

describe('mail template engine', () => {
  it('parses object JSON and rejects malformed or non-object roots', () => {
    expect(parseJsonObject('{"project":"RestX"}')).toEqual({ ok: true, value: { project: 'RestX' } })
    expect(parseJsonObject('[1,2]')).toMatchObject({ ok: false })
    expect(parseJsonObject('{oops')).toMatchObject({ ok: false })
  })

  it('deep-merges per-send data over defaults without mutating defaults', () => {
    const defaults = { project: '默认', owner: { name: '小李', email: 'old@example.com' }, tags: ['a'] }
    const merged = mergeJsonObjects(defaults, { project: 'RestX', owner: { email: 'new@example.com' }, tags: ['b'] })
    expect(merged).toEqual({ project: 'RestX', owner: { name: '小李', email: 'new@example.com' }, tags: ['b'] })
    expect(defaults.owner.email).toBe('old@example.com')
  })

  it('extracts and renders simple and dotted placeholders', () => {
    expect(extractPlaceholders('{{project}} {{ owner.name }} {{project}}')).toEqual(['project', 'owner.name'])
    expect(renderTemplateText('你好 {{owner.name}}，{{missing}}', { owner: { name: '小王' } })).toEqual({
      value: '你好 小王，{{missing}}', missing: ['missing']
    })
  })

  it('uses defaults for omitted values and per-send overrides for provided values', () => {
    const rendered = renderMailTemplate(template, { project: 'RestX', owner: { name: '小王' }, progress: 70 })
    expect(rendered.draft.to).toEqual(['owner@example.com'])
    expect(rendered.draft.subject).toBe('【RestX】本周周报')
    expect(rendered.draft.body).toContain('小王，您好。')
    expect(rendered.draft.body).toContain('风险：暂无')
    expect(rendered.issues).toEqual([])
  })

  it('reports unresolved variables and invalid recipients', () => {
    const rendered = renderMailTemplate({ ...template, to: '{{unknownEmail}}', body: '{{missing}}' }, {})
    expect(rendered.missingVariables).toEqual(['missing', 'unknownEmail'])
    expect(rendered.issues.map((issue) => issue.code)).toContain('missing-variable')
    expect(rendered.issues.map((issue) => issue.code)).toContain('invalid-recipient')
  })

  it('rejects malformed structured drafts at the process boundary', () => {
    expect(() => readMailDraft({ to: [], cc: [], bcc: [], subject: '主题', body: '正文' })).toThrow(/收件人/)
    expect(() => readMailDraft({ to: ['not-email'], cc: [], bcc: [], subject: '主题', body: '正文' })).toThrow(/无效邮箱/)
    expect(readMailDraft({ to: ['user@example.com'], cc: [], bcc: [], subject: '主题', body: '正文' })).toMatchObject({ subject: '主题' })
  })
})
