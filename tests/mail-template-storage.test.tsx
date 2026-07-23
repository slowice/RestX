// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { MailTemplate } from '../src/features/mail-template/shared/contracts'
import {
  MAIL_TEMPLATE_STORAGE_KEY,
  createBlankTemplate,
  duplicateMailTemplate,
  loadMailTemplates,
  saveMailTemplates
} from '../src/features/mail-template/renderer/template-storage'

beforeEach(() => localStorage.clear())

describe('mail template storage', () => {
  it('seeds examples when storage is empty or corrupt', () => {
    expect(loadMailTemplates(localStorage).map((item) => item.name)).toContain('项目周报')
    localStorage.setItem(MAIL_TEMPLATE_STORAGE_KEY, '{broken')
    expect(loadMailTemplates(localStorage).map((item) => item.name)).toContain('会议通知')
  })

  it('persists and restores a valid versioned template library', () => {
    const template: MailTemplate = { ...createBlankTemplate(new Date('2026-07-22T00:00:00Z')), name: '客户通知', to: 'client@example.com', subject: '通知', body: '正文' }
    saveMailTemplates(localStorage, [template])
    expect(loadMailTemplates(localStorage)).toEqual([template])
    expect(JSON.parse(localStorage.getItem(MAIL_TEMPLATE_STORAGE_KEY) ?? '{}')).toMatchObject({ version: 1 })
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
