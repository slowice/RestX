import type { CandidateKind, CandidateViewer } from './inspector'
import type { JsonlTagTone } from './jsonl'

export type AiToolPathFields = ({
  relativePath: string
  path?: never
} | {
  path: string
  relativePath?: never
}) & {
  platforms?: NodeJS.Platform[]
}

export type AiToolProbe = AiToolPathFields & {
  entryType: 'file' | 'directory'
}

export type AiToolMatchRule = {
  glob: string
  kind: CandidateKind
  viewer: CandidateViewer
  label: string
  jsonlProfileId?: string
}

export type JsonlTagRule = {
  path: string
  values?: Record<string, { label: string; tone: JsonlTagTone }>
  fallback?: 'raw-value' | 'ignore'
}

export type JsonlProfile = {
  id: string
  fileExtensions?: string[]
  timestampPaths: string[]
  sessionPaths?: string[]
  workspacePaths?: string[]
  summaryPaths?: string[]
  tagRules: JsonlTagRule[]
}

export type AiToolSource = AiToolPathFields & {
  id: string
  label: string
  patterns: AiToolMatchRule[]
  excludes?: string[]
  maxDepth: number
}

export type AiToolPreset = {
  id: string
  displayName: string
  version: number
  probes: AiToolProbe[]
  sources: AiToolSource[]
  jsonlProfiles?: JsonlProfile[]
}
