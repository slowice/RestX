export type JsonlTagTone = 'neutral' | 'user' | 'assistant' | 'thinking' | 'tool' | 'result' | 'system' | 'error'

export type JsonlTag = {
  label: string
  tone: JsonlTagTone
}

export type JsonlPageRequest = {
  path: string
  profileId: string
  cursor?: string
  snapshotId?: string
  limit?: number
  query?: string
}

export type JsonlEntryRequest = {
  path: string
  profileId: string
  offset: string
  byteLength: number
  snapshotId: string
}

export type JsonlEventSummary = {
  offset: string
  byteLength: number
  rawPreview: string
  timestamp: string | null
  sessionId: string | null
  workspace: string | null
  contentPreview: string | null
  tags: JsonlTag[]
  parseStatus: 'valid' | 'invalid' | 'oversized'
}

export type JsonlPage = {
  file: {
    path: string
    name: string
    sizeBytes: number
    modifiedAt: string
    snapshotId: string
  }
  entries: JsonlEventSummary[]
  olderCursor: string | null
  changed: boolean
  search: {
    query: string
    scannedEntries: number
    scannedBytes: number
    truncated: boolean
  } | null
}

export type JsonlEntryDetail = {
  offset: string
  raw: string
  formatted: string | null
  tags: JsonlTag[]
  parseError: string | null
  truncated: boolean
}

export type JsonlWorkspaceSearchRequest = {
  query: string
  files: Array<{
    path: string
    profileId: string
  }>
}

export type JsonlWorkspaceSearchHit = {
  file: {
    path: string
    name: string
    modifiedAt: string
    snapshotId: string
  }
  entry: JsonlEventSummary
}

export type JsonlWorkspaceSearchResult = {
  query: string
  hits: JsonlWorkspaceSearchHit[]
  scannedFiles: number
  totalFiles: number
  scannedEntries: number
  scannedBytes: number
  truncated: boolean
}
