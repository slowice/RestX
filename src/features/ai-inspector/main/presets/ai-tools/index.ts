import { claudeCodePreset } from './claude-code'
import { codexPreset } from './codex'
import { openClawPreset } from './openclaw'
import { openCodePreset } from './opencode'
import type { AiToolPreset } from './types'

export const AI_TOOL_PRESETS: readonly AiToolPreset[] = [codexPreset, claudeCodePreset, openCodePreset, openClawPreset]
let registeredPresets: readonly AiToolPreset[] = AI_TOOL_PRESETS

export function findJsonlProfile(profileId: string) {
  return registeredPresets.flatMap((preset) => preset.jsonlProfiles ?? []).find((profile) => profile.id === profileId) ?? null
}

export function setRegisteredAiToolPresets(presets: readonly AiToolPreset[]): void {
  registeredPresets = [...presets]
}

export function getRegisteredAiToolPresets(): readonly AiToolPreset[] {
  return registeredPresets
}

export type { AiToolMatchRule, AiToolPreset, AiToolProbe, AiToolSource, JsonlProfile, JsonlTagRule } from './types'
