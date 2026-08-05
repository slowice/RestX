import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FrequentSkillsService } from '../src/features/frequent-skills/main/frequent-skills-service'
import { serializeSkillMarkdown } from '../src/features/frequent-skills/main/services/skill-markdown'
import { SkillStore } from '../src/features/frequent-skills/main/services/skill-store'
import { frequentSkillsPreloadFeature } from '../src/features/frequent-skills/preload/api'
import { frequentSkillsChannels } from '../src/features/frequent-skills/shared/channels'
import type { AiProviderExecutionContext } from '../src/platform/ai-provider/shared/contracts'
import type { PreloadInvoke } from '../src/platform/preload/define-feature'

const temporaryRoots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'restx-skills-api-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function executionContext(fetchImpl: typeof fetch): AiProviderExecutionContext {
  return {
    provider: {
      id: 'provider-1', name: 'Test', source: 'manual', baseUrl: 'https://example.test/v1', modelId: 'test-model',
      useSystemProxy: false, apiKey: 'secret', customHeaders: {}, identityFingerprint: 'identity', credentialFingerprint: 'credential'
    },
    fetch: fetchImpl
  }
}

describe('frequent skills API', () => {
  it('exposes only fixed methods and channels', async () => {
    const calls = vi.fn()
    const invoke: PreloadInvoke = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
      calls(channel, ...args)
      return { ok: true, data: undefined } as T
    }
    const api = frequentSkillsPreloadFeature.createApi(invoke)
    const draft = { name: 'Skill', description: '', prompt: 'Prompt' }
    await api.frequentSkills.list()
    await api.frequentSkills.create(draft)
    await api.frequentSkills.update({ id: 'skill-1', ...draft })
    await api.frequentSkills.delete('skill-1')
    await api.frequentSkills.importSkill()
    await api.frequentSkills.execute('skill-1')
    expect(calls.mock.calls).toEqual([
      [frequentSkillsChannels.list],
      [frequentSkillsChannels.create, draft],
      [frequentSkillsChannels.update, { id: 'skill-1', ...draft }],
      [frequentSkillsChannels.delete, 'skill-1'],
      [frequentSkillsChannels.import],
      [frequentSkillsChannels.execute, 'skill-1']
    ])
  })

  it('strictly imports a copy and leaves the source unchanged', async () => {
    const root = await temporaryRoot()
    const sourceRoot = await temporaryRoot()
    const sourcePath = path.join(sourceRoot, 'SKILL.md')
    const source = serializeSkillMarkdown({
      schemaVersion: 1, id: 'portable-skill', name: 'Portable', description: 'Import me', prompt: 'Portable prompt',
      createdAt: '2026-08-05T01:00:00.000Z', updatedAt: '2026-08-05T01:00:00.000Z'
    })
    await writeFile(sourcePath, source)
    const service = new FrequentSkillsService({
      store: new SkillStore(root), chooseImportFile: async () => sourcePath, trashItem: vi.fn(), executeActive: vi.fn()
    })
    const result = await service.importSkill()

    expect(result.cancelled).toBe(false)
    expect(result.skill).toMatchObject({ name: 'Portable', prompt: 'Portable prompt' })
    expect(result.skill?.id).not.toBe('portable-skill')
    expect(await readFile(sourcePath, 'utf8')).toBe(source)
  })

  it('executes the latest prompt once and blocks overlapping execution', async () => {
    const root = await temporaryRoot()
    const store = new SkillStore(root)
    const skill = await store.create({ name: 'Execute', description: '', prompt: 'Run this exact prompt' })
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      await gate
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> }
      expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'Run this exact prompt' })
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Executed result' } }] }), { status: 200 })
    }) as unknown as typeof fetch
    const service = new FrequentSkillsService({
      store, chooseImportFile: async () => null, trashItem: vi.fn(),
      executeActive: (operation) => operation(executionContext(fetchImpl)),
      now: () => new Date('2026-08-05T03:00:00.000Z')
    })

    const first = service.execute(skill.id)
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    await expect(service.execute(skill.id)).rejects.toMatchObject({ code: 'EXECUTION_IN_PROGRESS' })
    release?.()
    await expect(first).resolves.toEqual({ skillId: skill.id, skillName: 'Execute', text: 'Executed result', completedAt: '2026-08-05T03:00:00.000Z' })
  })

  it('maps a missing active provider without mutating the skill', async () => {
    const root = await temporaryRoot()
    const store = new SkillStore(root)
    const skill = await store.create({ name: 'No provider', description: '', prompt: 'Prompt' })
    const service = new FrequentSkillsService({
      store, chooseImportFile: async () => null, trashItem: vi.fn(),
      executeActive: async () => { throw Object.assign(new Error('secret settings detail'), { code: 'INVALID_SETTINGS' }) }
    })
    await expect(service.execute(skill.id)).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' })
    await expect(store.get(skill.id)).resolves.toMatchObject({ prompt: 'Prompt' })
  })
})
