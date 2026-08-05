import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSkillMarkdown, serializeSkillMarkdown } from '../src/features/frequent-skills/main/services/skill-markdown'
import { SkillStore } from '../src/features/frequent-skills/main/services/skill-store'
import type { FrequentSkill } from '../src/features/frequent-skills/shared/contracts'

const temporaryRoots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'restx-skills-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const example: FrequentSkill = {
  schemaVersion: 1,
  id: 'daily-summary-a1b2c3d4',
  name: '每日总结',
  description: '整理今日工作',
  prompt: '请把今日工作整理成三点。',
  createdAt: '2026-08-05T01:00:00.000Z',
  updatedAt: '2026-08-05T01:00:00.000Z'
}

describe('RestX Skill Markdown', () => {
  it('round-trips the strict schema and rejects incompatible files', () => {
    const markdown = serializeSkillMarkdown(example)
    expect(parseSkillMarkdown(markdown)).toEqual(example)
    expect(() => parseSkillMarkdown(markdown.replace('schemaVersion: 1', 'schemaVersion: 2'))).toThrow(/格式无效/)
    expect(() => parseSkillMarkdown(markdown.replace('updatedAt:', 'extra: true\nupdatedAt:'))).toThrow(/格式无效/)
    expect(() => parseSkillMarkdown(markdown.replace('请把今日工作整理成三点。', '   '))).toThrow(/格式无效/)
  })
})

describe('SkillStore', () => {
  it('creates, updates, lists, and persists one Markdown source of truth', async () => {
    const root = await temporaryRoot()
    let timestamp = new Date('2026-08-05T01:00:00.000Z')
    const store = new SkillStore(root, () => timestamp)
    const created = await store.create({ name: 'Daily Summary', description: '', prompt: 'First prompt' })
    timestamp = new Date('2026-08-05T02:00:00.000Z')
    const updated = await store.update(created.id, { name: 'Daily Summary', description: 'Updated', prompt: 'Second prompt' })

    expect(updated).toMatchObject({ id: created.id, createdAt: created.createdAt, updatedAt: timestamp.toISOString(), prompt: 'Second prompt' })
    expect((await store.list()).skills).toEqual([updated])
    expect(parseSkillMarkdown(await readFile(path.join(root, created.id, 'SKILL.md'), 'utf8'))).toEqual(updated)
  })

  it('isolates invalid entries and rejects symlinks and crafted ids', async () => {
    const root = await temporaryRoot()
    const outside = await temporaryRoot()
    const store = new SkillStore(root)
    const valid = await store.create({ name: 'Valid', description: '', prompt: 'Prompt' })
    await mkdir(path.join(root, 'broken'))
    await writeFile(path.join(root, 'broken', 'SKILL.md'), 'not a skill')
    await writeFile(path.join(outside, 'SKILL.md'), serializeSkillMarkdown({ ...example, id: 'linked' }))
    await symlink(outside, path.join(root, 'linked'))

    const result = await store.list()
    expect(result.skills.map((skill) => skill.id)).toEqual([valid.id])
    expect(result.invalidCount).toBe(2)
    await expect(store.get('../outside')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(store.get('linked')).rejects.toMatchObject({ code: 'INVALID_SKILL_FILE' })
  })
})
