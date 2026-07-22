import type { AiToolPreset } from './ai-tool-preset'
import type { DetectedAiTool, ScanCandidate } from './inspector'

export type PresetInventoryEntry = {
  path: string
  type: 'file' | 'directory'
  sizeBytes?: number
  modifiedAt?: string
}

export type SmartPresetDraftRequest = {
  toolName: string
  rootPath: string
  knownPaths: string
  notes: string
  metadataConsent: boolean
}

export type SmartPresetDraft = {
  preset: AiToolPreset
  explanation: string
  warnings: string[]
  inventory: {
    rootPath: string
    entryCount: number
    truncated: boolean
  }
  trial: {
    detected: boolean
    tool: DetectedAiTool
    candidates: ScanCandidate[]
  }
}

export type UserPresetSummary = {
  id: string
  displayName: string
  enabled: boolean
  valid: boolean
  format: 'json' | 'yaml'
  filePath: string
  error: string | null
}

export type SaveUserPresetInput = {
  preset: AiToolPreset
  overwrite?: boolean
}
