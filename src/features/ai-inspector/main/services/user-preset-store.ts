import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getRestxStorageLayout } from '../../../../platform/main/storage'
import { parse as parseYaml } from 'yaml'
import type { AiToolPreset } from '../../shared/contracts/ai-tool-preset'
import type { UserPresetSummary } from '../../shared/contracts/smart-import'
import { AI_TOOL_PRESETS, setRegisteredAiToolPresets } from '../presets/ai-tools'
import { assertAiToolPresetUsesRelativePaths, parseAiToolPreset, validateAiToolPresets } from '../presets/ai-tools/validator'

type PresetState = { disabled: string[] }
type LoadedUserPresets = { presets: AiToolPreset[]; summaries: UserPresetSummary[] }

export const USER_PRESET_DIRECTORY = getRestxStorageLayout().presets
const STATE_FILE = 'state.json'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '无法读取预置'
}

export class UserPresetStore {
  constructor(private readonly directory = USER_PRESET_DIRECTORY) {}

  private async ensureDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
  }

  private async readState(): Promise<PresetState> {
    try {
      const value = JSON.parse(await readFile(path.join(this.directory, STATE_FILE), 'utf8')) as Partial<PresetState>
      return { disabled: Array.isArray(value.disabled) ? value.disabled.filter((id): id is string => typeof id === 'string') : [] }
    } catch {
      return { disabled: [] }
    }
  }

  private async writeState(state: PresetState): Promise<void> {
    await this.ensureDirectory()
    const destination = path.join(this.directory, STATE_FILE)
    const temporary = path.join(this.directory, `.state-${randomUUID()}.tmp`)
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, destination)
  }

  async load(): Promise<LoadedUserPresets> {
    await this.ensureDirectory()
    const state = await this.readState()
    const builtInIds = new Set(AI_TOOL_PRESETS.map((preset) => preset.id))
    const seenProfileIds = new Set(AI_TOOL_PRESETS.flatMap((preset) => (preset.jsonlProfiles ?? []).map((profile) => profile.id)))
    const seenIds = new Set<string>()
    const presets: AiToolPreset[] = []
    const summaries: UserPresetSummary[] = []
    const entries = await readdir(this.directory, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || entry.name === STATE_FILE || entry.name.startsWith('.')) continue
      const extension = path.extname(entry.name).toLowerCase()
      if (!['.json', '.yaml', '.yml'].includes(extension)) continue
      const filePath = path.join(this.directory, entry.name)
      const format = extension === '.json' ? 'json' : 'yaml'
      try {
        const text = await readFile(filePath, 'utf8')
        if (text.length > 512 * 1024) throw new Error('预置文件超过 512 KiB')
        const preset = parseAiToolPreset(format === 'json' ? JSON.parse(text) : parseYaml(text))
        assertAiToolPresetUsesRelativePaths(preset)
        if (builtInIds.has(preset.id)) throw new Error(`不能覆盖内置预置：${preset.id}`)
        if (preset.id === 'state' || seenIds.has(preset.id)) throw new Error(`用户预置 id 重复或保留：${preset.id}`)
        const duplicateProfile = (preset.jsonlProfiles ?? []).find((profile) => seenProfileIds.has(profile.id))
        if (duplicateProfile) throw new Error(`JSONL profile id 与其他预置重复：${duplicateProfile.id}`)
        seenIds.add(preset.id)
        for (const profile of preset.jsonlProfiles ?? []) seenProfileIds.add(profile.id)
        const enabled = !state.disabled.includes(preset.id)
        summaries.push({ id: preset.id, displayName: preset.displayName, enabled, valid: true, format, filePath, error: null })
        if (enabled) presets.push(preset)
      } catch (error) {
        summaries.push({
          id: path.basename(entry.name, extension), displayName: path.basename(entry.name, extension), enabled: false,
          valid: false, format, filePath, error: errorText(error)
        })
      }
    }
    return { presets, summaries }
  }

  async save(presetValue: unknown, overwrite = false): Promise<UserPresetSummary> {
    const preset = parseAiToolPreset(presetValue)
    assertAiToolPresetUsesRelativePaths(preset)
    if (AI_TOOL_PRESETS.some((builtIn) => builtIn.id === preset.id) || preset.id === 'state') throw new Error('该预置 id 为内置或保留 id。')
    const current = await this.load()
    const existing = current.summaries.find((item) => item.id === preset.id)
    if (existing && !overwrite) throw new Error(`预置 ${preset.id} 已存在。`)
    await this.ensureDirectory()
    const destination = path.join(this.directory, `${preset.id}.json`)
    const temporary = path.join(this.directory, `.${preset.id}-${randomUUID()}.tmp`)
    await writeFile(temporary, `${JSON.stringify(preset, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, destination)
    if (existing && existing.filePath !== destination) await unlink(existing.filePath).catch(() => undefined)
    const state = await this.readState()
    await this.writeState({ disabled: state.disabled.filter((id) => id !== preset.id) })
    return { id: preset.id, displayName: preset.displayName, enabled: true, valid: true, format: 'json', filePath: destination, error: null }
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const loaded = await this.load()
    const preset = loaded.summaries.find((item) => item.id === id && item.valid)
    if (!preset) throw new Error('找不到可管理的用户预置。')
    const state = await this.readState()
    const disabled = new Set(state.disabled)
    if (enabled) disabled.delete(id); else disabled.add(id)
    await this.writeState({ disabled: [...disabled].sort() })
  }

  async delete(id: string): Promise<void> {
    const loaded = await this.load()
    const preset = loaded.summaries.find((item) => item.id === id)
    if (!preset) throw new Error('找不到用户预置。')
    await unlink(preset.filePath)
    const state = await this.readState()
    await this.writeState({ disabled: state.disabled.filter((item) => item !== id) })
  }
}

export const userPresetStore = new UserPresetStore()

export async function refreshAiToolPresetRegistry(): Promise<LoadedUserPresets> {
  const loaded = await userPresetStore.load()
  const merged = [...AI_TOOL_PRESETS, ...loaded.presets]
  validateAiToolPresets(merged)
  setRegisteredAiToolPresets(merged)
  return loaded
}
