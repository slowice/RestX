// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RestXApi } from '../src/app-api'
import type { FrequentSkillsApi } from '../src/features/frequent-skills/shared/api'
import type { FrequentSkill } from '../src/features/frequent-skills/shared/contracts'
import { FrequentSkillsPage } from '../src/features/frequent-skills/renderer/FrequentSkillsPage'

const skill: FrequentSkill = {
  schemaVersion: 1,
  id: 'meeting-notes-12345678',
  name: '整理会议纪要',
  description: '提炼行动项',
  prompt: '请整理会议纪要。',
  createdAt: '2026-08-05T01:00:00.000Z',
  updatedAt: '2026-08-05T01:00:00.000Z'
}

function success<T>(data: T) {
  return Promise.resolve({ ok: true as const, data })
}

function installApi(): FrequentSkillsApi['frequentSkills'] {
  const api: FrequentSkillsApi['frequentSkills'] = {
    list: vi.fn(() => success({ skills: [skill], invalidCount: 0 })),
    create: vi.fn((input) => success({ ...skill, id: 'new-skill-12345678', ...input })),
    update: vi.fn((input) => success({ ...skill, ...input })),
    delete: vi.fn(() => success(undefined)),
    importSkill: vi.fn(() => success({ cancelled: true })),
    execute: vi.fn(() => success({ skillId: skill.id, skillName: skill.name, text: '这里是执行结果', completedAt: '2026-08-05T02:00:00.000Z' }))
  }
  Object.defineProperty(window, 'restx', { configurable: true, value: { frequentSkills: api } as unknown as RestXApi })
  return api
}

beforeEach(() => installApi())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('FrequentSkillsPage', () => {
  it('places execute on the skill row and displays only the latest in-memory result', async () => {
    const api = installApi()
    render(<FrequentSkillsPage />)
    expect(await screen.findByText('整理会议纪要')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '执行' }))

    await waitFor(() => expect(api.execute).toHaveBeenCalledWith(skill.id))
    expect(await screen.findByText('这里是执行结果')).toBeInTheDocument()
    expect(screen.queryByText('执行历史')).not.toBeInTheDocument()
  })

  it('creates a skill through the validated editor', async () => {
    const api = installApi()
    render(<FrequentSkillsPage />)
    await screen.findByText('整理会议纪要')
    fireEvent.click(screen.getByRole('button', { name: '新增 Skill' }))
    fireEvent.change(screen.getByPlaceholderText('例如：整理会议纪要'), { target: { value: '新技能' } })
    fireEvent.change(screen.getByPlaceholderText('输入每次点击执行时发送给 AI 的完整提示词'), { target: { value: '固定提示词' } })
    fireEvent.click(screen.getByRole('button', { name: '保存 Skill' }))

    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ name: '新技能', description: '', prompt: '固定提示词' }))
    expect(await screen.findByText('Skill“新技能”已新增。')).toBeInTheDocument()
  })
})
