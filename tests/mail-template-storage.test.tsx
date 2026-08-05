// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { MailTemplate } from '../src/features/mail-template/shared/contracts'
import {
  MAIL_TEMPLATE_STORAGE_KEY,
  LEGACY_MAIL_TEMPLATE_STORAGE_KEY,
  createBlankTemplate,
  duplicateMailTemplate,
  loadMailTemplateLibrary,
  loadMailTemplates,
  saveMailTemplates
} from '../src/features/mail-template/renderer/template-storage'

beforeEach(() => localStorage.clear())

describe('mail template storage', () => {
  it('seeds examples only when storage is empty', () => {
    expect(loadMailTemplates(localStorage).map((item) => item.name)).toContain('项目周报')
    localStorage.setItem(MAIL_TEMPLATE_STORAGE_KEY, '{broken')
    expect(loadMailTemplateLibrary(localStorage)).toMatchObject({ templates: [], migrated: false, error: expect.stringContaining('原始数据已保留') })
  })

  it('persists and restores a valid versioned template library', () => {
    const blank = createBlankTemplate(new Date('2026-07-22T00:00:00Z'))
    const template: MailTemplate = { ...blank, name: '客户通知', to: 'client@example.com', subject: '通知', bodyHtml: '<p>正文</p>', bodyText: '正文' }
    saveMailTemplates(localStorage, [template])
    expect(loadMailTemplates(localStorage)).toEqual([template])
    expect(JSON.parse(localStorage.getItem(MAIL_TEMPLATE_STORAGE_KEY) ?? '{}')).toMatchObject({ version: 2 })
  })

  it('migrates version-1 plain text in memory without overwriting it', () => {
    localStorage.setItem(LEGACY_MAIL_TEMPLATE_STORAGE_KEY, JSON.stringify({ version: 1, templates: [{
      id: 'legacy', name: '旧模板', to: 'a@example.com', cc: '', bcc: '', subject: '主题', body: '<b>不是标签</b>\n第二行', defaults: {}, updatedAt: '2026-01-01T00:00:00.000Z'
    }] }))
    const loaded = loadMailTemplateLibrary(localStorage)
    expect(loaded).toMatchObject({ migrated: true, error: null })
    expect(loaded.templates[0].bodyHtml).toContain('&lt;b&gt;不是标签&lt;/b&gt;')
    expect(loaded.templates[0].bodyText).toBe('<b>不是标签</b>\n第二行')
    expect(localStorage.getItem(MAIL_TEMPLATE_STORAGE_KEY)).toBeNull()
  })

  it('preserves a recognized invalid envelope instead of replacing it', () => {
    const raw = JSON.stringify({ version: 2, templates: [{ id: 'broken' }] })
    localStorage.setItem(MAIL_TEMPLATE_STORAGE_KEY, raw)
    expect(loadMailTemplateLibrary(localStorage)).toMatchObject({ templates: [], error: expect.any(String) })
    expect(localStorage.getItem(MAIL_TEMPLATE_STORAGE_KEY)).toBe(raw)
  })

  it('duplicates templates as independent copies', () => {
    const original = { ...createBlankTemplate(), name: '模板', defaults: { nested: { value: '原值' } } }
    const duplicate = duplicateMailTemplate(original)
    expect(duplicate.id).not.toBe(original.id)
    expect(duplicate.name).toBe('模板 - 副本')
    ;(duplicate.defaults.nested as { value: string }).value = '新值'
    expect(original.defaults).toEqual({ nested: { value: '原值' } })
  })
})
