export type CandidateKind = 'config' | 'instruction' | 'conversation' | 'history' | 'log'
export type CandidateViewer = 'config' | 'jsonl' | 'metadata'

export type ScanCandidate = {
  path: string
  name: string
  kind: CandidateKind
  viewer: CandidateViewer
  jsonlProfileId?: string
  matchedBy: string
  sizeBytes: number
  modifiedAt: string
  toolId?: string
  sourceId?: string
  relativePath?: string
}

export type ToolDetectionEvidence = {
  path: string
  entryType: 'file' | 'directory'
}

export type ToolCandidateCounts = Record<CandidateKind, number>

export type ToolFolderNode = {
  id: string
  name: string
  path: string | null
  role: 'category' | 'physical'
  kind: CandidateKind
  counts: ToolCandidateCounts
  children: ToolFolderNode[]
  files: ScanCandidate[]
}

export type DetectedAiTool = {
  id: string
  displayName: string
  status: 'detected' | 'not-detected'
  evidence: ToolDetectionEvidence[]
  counts: ToolCandidateCounts
  folders: ToolFolderNode[]
}

export type SkippedEntry = { path: string; reason: string }

export type ScanResult = {
  rootPath: string
  startedAt: string
  completedAt: string
  scannedFileCount: number
  candidates: ScanCandidate[]
  tools: DetectedAiTool[]
  skipped: SkippedEntry[]
}

export type ScanOptions = {
  maxDepth?: number
  maxFiles?: number
  maxFileSizeBytes?: number
}
