export type ReviewZone = 'blue' | 'yellow'
export type ReviewPlatform = 'gitcode' | 'codehub'
export type ReviewSeverity = 'P0' | 'P1' | 'P2' | 'P3'
export type ReviewCategory = 'security' | 'bug' | 'logging' | 'consistency' | 'test' | 'maintainability'
export type ReviewConfidence = 'high' | 'medium' | 'low'

export type MergeRequestLocator = {
  platform: ReviewPlatform
  zone: ReviewZone
  owner: string
  repository: string
  number: number
  webUrl: string
}

export type ReviewFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'unknown'

export type ReviewFilePreview = {
  path: string
  oldPath?: string
  status: ReviewFileStatus
  additions: number
  deletions: number
  eligible: boolean
  exclusionReason?: string
  patchCharacters: number
}

export type ReviewSourcePreview = {
  sourceId: string
  locator: MergeRequestLocator
  title: string
  state: string
  author: string | null
  baseBranch: string
  headBranch: string
  headSha: string
  files: ReviewFilePreview[]
  additions: number
  deletions: number
  eligibleFiles: number
  excludedFiles: number
  inputCharacters: number
  contextMode: 'remote-limited' | 'local-enriched'
}

export type PreviewReviewSourceInput = {
  url: string
  zone: ReviewZone
}

export type RunCodeReviewInput = PreviewReviewSourceInput & {
  requirements?: string
  force?: boolean
}

export type ReviewFinding = {
  id: string
  severity: ReviewSeverity
  category: ReviewCategory
  title: string
  explanation: string
  evidence: string
  filePath: string
  startLine: number
  endLine?: number
  ruleId: string
  confidence: ReviewConfidence
  suggestion?: string
}

export type CodeReviewResult = {
  reviewId: string
  sourceId: string
  summary: string
  findings: ReviewFinding[]
  reviewedFiles: number
  excludedFiles: number
  model: string
  rules: Array<{ id: string; name: string; version: string }>
  analyzedAt: string
  expiresAt: string
  cacheStatus: 'hit' | 'miss' | 'refresh'
}

export type GitCodePublicSettings = {
  apiBaseUrl: string
  accessTokenConfigured: boolean
}

export type GitCodeSettingsInput = {
  accessToken?: string
  clearAccessToken?: boolean
}

export type GitCodeConnectionStatus = {
  ok: boolean
  account?: string
  message: string
}

export type CodeHubPublicSettings = {
  privateTokenConfigured: boolean
}

export type CodeHubSettingsInput = {
  privateToken?: string
  clearPrivateToken?: boolean
}

export type GitCodeIdentityMatch = 'matched' | 'mismatched' | 'local-email-unavailable' | 'remote-email-unavailable'
export type MergeRequestReviewStatus = 'unreviewed' | 'passed' | 'issues' | 'stale'

export type GitCodeIdentity = {
  localGitEmail: string | null
  accountLogin: string
  accountName: string
  match: GitCodeIdentityMatch
}

export type MergeRequestReviewState = {
  status: MergeRequestReviewStatus
  findingCount?: number
  analyzedAt?: string
}

export type GitCodeMergeRequestSummary = {
  sourceId: string
  locator: MergeRequestLocator
  title: string
  state: string
  author: string | null
  baseBranch: string
  headBranch: string
  headSha: string
  updatedAt: string | null
  draft: boolean
  review: MergeRequestReviewState
}

export type GitCodeMergeRequestList = {
  identity: GitCodeIdentity
  mergeRequests: GitCodeMergeRequestSummary[]
  fetchedAt: string
}
