import { createHash } from 'node:crypto'
import type { GitCodeIdentityMatch, GitCodeMergeRequestList, GitCodeMergeRequestSummary, MergeRequestLocator, ReviewFileStatus } from '../../shared/contracts/code-review'
import { MergeRequestSourceAdapter, parseChangedNewLines, ReviewSourceError, type LoadedReviewSource } from './code-review-source'

export const GITCODE_API_BASE_URL = 'https://api.gitcode.com/api/v5'
const MAX_FILES = 120
const MAX_PATCH_CHARACTERS = 45_000
const MAX_TOTAL_CHARACTERS = 220_000

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

type GitCodeAdapterOptions = {
  getAccessToken(): string
  fetchImpl?: FetchLike
  apiBaseUrl?: string
}

function requiredString(value: unknown, field: string, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function branchValue(value: unknown): { ref: string; sha: string } {
  if (!value || typeof value !== 'object') return { ref: '', sha: '' }
  const branch = value as Record<string, unknown>
  return {
    ref: requiredString(branch.ref ?? branch.label ?? branch.name, 'branch'),
    sha: requiredString(branch.sha ?? branch.commit_id ?? (branch.commit as Record<string, unknown> | undefined)?.id, 'sha')
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  const record = recordValue(value)
  const nested = record.pull_requests ?? record.merge_requests ?? record.items
  return Array.isArray(nested) ? nested : []
}

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase()
}
function normalizeStatus(value: unknown, patch: Record<string, unknown>): ReviewFileStatus {
  if (patch.new_file === true || value === 'added') return 'added'
  if (patch.deleted_file === true || value === 'removed' || value === 'deleted') return 'deleted'
  if (patch.renamed_file === true || value === 'renamed') return 'renamed'
  if (value === 'modified' || value === 'changed' || value == null) return 'modified'
  return 'unknown'
}

export class GitCodeAdapter implements MergeRequestSourceAdapter {
  readonly id = 'gitcode' as const
  readonly zone = 'blue' as const
  private readonly fetchImpl: FetchLike
  private readonly apiBaseUrl: string

  constructor(private readonly options: GitCodeAdapterOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.apiBaseUrl = (options.apiBaseUrl ?? GITCODE_API_BASE_URL).replace(/\/+$/, '')
  }

  matches(url: URL): boolean {
    return url.hostname.toLowerCase() === 'gitcode.com' && /^\/[^/]+\/[^/]+\/(?:pull|pulls|merge_requests)\/\d+(?:\/.*)?$/.test(url.pathname)
  }

  parseUrl(url: URL): MergeRequestLocator {
    if (!this.matches(url)) throw new ReviewSourceError('无法识别该 GitCode PR 链接。', 'INVALID_URL')
    const match = /^\/([^/]+)\/([^/]+)\/(?:pull|pulls|merge_requests)\/(\d+)/.exec(url.pathname)
    if (!match) throw new ReviewSourceError('GitCode PR 链接缺少仓库或编号。', 'INVALID_URL')
    const owner = decodeURIComponent(match[1])
    const repository = decodeURIComponent(match[2]).replace(/\.git$/, '')
    const number = Number(match[3])
    return { platform: 'gitcode', zone: 'blue', owner, repository, number, webUrl: `https://gitcode.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pull/${number}` }
  }

  async listMine(localGitEmail: string | null): Promise<GitCodeMergeRequestList> {
    const token = this.options.getAccessToken().trim()
    if (!token) throw new ReviewSourceError('请先在设置中配置 GitCode 个人访问令牌（PAT）。', 'AUTHENTICATION_REQUIRED')
    const pullsPath = '/user/pulls?scope=created_by_me&state=open&sort=updated&direction=desc&per_page=50&page=1'
    const [profileValue, pullsValue, emailsValue] = await Promise.all([
      this.request('/user', token),
      this.request(pullsPath, token),
      this.optionalRequest('/emails', token)
    ])
    const profile = recordValue(profileValue)
    const accountLogin = requiredString(profile.login ?? profile.username, 'login')
    if (!accountLogin) throw new ReviewSourceError('GitCode 当前用户信息缺少账号标识。', 'INVALID_RESPONSE')
    const accountName = requiredString(profile.name, 'name', accountLogin)
    const remoteEmails = new Set<string>()
    const profileEmail = requiredString(profile.email, 'email')
    if (profileEmail) remoteEmails.add(normalizedEmail(profileEmail))
    for (const value of arrayValue(emailsValue)) {
      const emailRecord = recordValue(value)
      const email = requiredString(emailRecord.email, 'email')
      if (email && (emailRecord.state === undefined || emailRecord.state === 'confirmed')) remoteEmails.add(normalizedEmail(email))
    }
    const localNormalized = localGitEmail ? normalizedEmail(localGitEmail) : ''
    const match: GitCodeIdentityMatch = !localNormalized
      ? 'local-email-unavailable'
      : remoteEmails.size === 0
        ? 'remote-email-unavailable'
        : remoteEmails.has(localNormalized) ? 'matched' : 'mismatched'

    const mergeRequests = arrayValue(pullsValue)
      .slice(0, 50)
      .map((value) => this.parseMergeRequestSummary(value))
      .filter((value): value is GitCodeMergeRequestSummary => value !== null)
    return {
      identity: { localGitEmail, accountLogin, accountName, match },
      mergeRequests,
      fetchedAt: new Date().toISOString()
    }
  }

  async load(locator: MergeRequestLocator): Promise<LoadedReviewSource> {
    if (locator.platform !== 'gitcode' || locator.zone !== 'blue') throw new ReviewSourceError('GitCode 来源区域无效。', 'ZONE_MISMATCH')
    const token = this.options.getAccessToken().trim()
    if (!token) throw new ReviewSourceError('请先在设置中配置 GitCode 个人访问令牌（PAT）。', 'AUTHENTICATION_REQUIRED')
    const path = `/repos/${encodeURIComponent(locator.owner)}/${encodeURIComponent(locator.repository)}/pulls/${locator.number}`
    const [metadata, filesValue] = await Promise.all([this.request(path, token), this.request(`${path}/files`, token)])
    if (!metadata || typeof metadata !== 'object') throw new ReviewSourceError('GitCode 返回的 PR 信息无效。', 'INVALID_RESPONSE')
    if (!Array.isArray(filesValue)) throw new ReviewSourceError('GitCode 返回的变更文件列表无效。', 'INVALID_RESPONSE')
    if (filesValue.length > MAX_FILES) throw new ReviewSourceError(`该 PR 包含 ${filesValue.length} 个文件，超过首版 ${MAX_FILES} 个文件的限制。`, 'SOURCE_TOO_LARGE')

    const meta = metadata as Record<string, unknown>
    const base = branchValue(meta.base ?? meta.target_branch)
    const head = branchValue(meta.head ?? meta.source_branch)
    let totalCharacters = 0
    const files = filesValue.map((value) => {
      if (!value || typeof value !== 'object') throw new ReviewSourceError('GitCode 变更文件数据无效。', 'INVALID_RESPONSE')
      const item = value as Record<string, unknown>
      const patchValue = item.patch
      const patchObject = patchValue && typeof patchValue === 'object' ? patchValue as Record<string, unknown> : {}
      const patch = typeof patchValue === 'string' ? patchValue : requiredString(patchObject.diff, 'diff')
      const path = requiredString(item.filename ?? patchObject.new_path ?? item.new_path, 'filename')
      if (!path) throw new ReviewSourceError('GitCode 变更文件缺少路径。', 'INVALID_RESPONSE')
      const oldPath = requiredString(patchObject.old_path ?? item.old_path, 'oldPath')
      const tooLarge = patchObject.too_large === true || patch.length > MAX_PATCH_CHARACTERS
      const binary = !patch && (item.binary === true || item.status === 'binary')
      const eligible = Boolean(patch) && !tooLarge && !binary
      if (eligible) totalCharacters += patch.length
      return {
        path,
        ...(oldPath && oldPath !== path ? { oldPath } : {}),
        status: normalizeStatus(item.status, patchObject),
        additions: numberValue(item.additions ?? item.added_lines),
        deletions: numberValue(item.deletions ?? item.remove_lines),
        eligible,
        ...(!eligible ? { exclusionReason: tooLarge ? '单文件变更过大' : binary ? '二进制文件' : '缺少文本 diff' } : {}),
        patchCharacters: eligible ? patch.length : 0,
        patch: eligible ? patch : '',
        changedNewLines: eligible ? parseChangedNewLines(patch) : new Set<number>()
      }
    })
    if (totalCharacters > MAX_TOTAL_CHARACTERS) throw new ReviewSourceError(`该 PR 的文本 diff 约 ${totalCharacters.toLocaleString()} 字符，超过首版 ${MAX_TOTAL_CHARACTERS.toLocaleString()} 字符限制。`, 'SOURCE_TOO_LARGE')
    const title = requiredString(meta.title, 'title', `PR #${locator.number}`)
    const headSha = head.sha || requiredString(meta.sha ?? meta.head_sha, 'headSha') || createHash('sha256').update(files.map((file) => file.patch).join('\n')).digest('hex')
    const state = requiredString(meta.state ?? meta.status, 'state', 'unknown')
    const authorObject = meta.user && typeof meta.user === 'object' ? meta.user as Record<string, unknown> : {}
    const author = requiredString(authorObject.name ?? authorObject.login ?? meta.author, 'author') || null
    const preview = {
      sourceId: `gitcode:${locator.owner}/${locator.repository}#${locator.number}@${headSha}`,
      locator,
      title,
      state,
      author,
      baseBranch: base.ref || requiredString(meta.target_branch, 'baseBranch', '未知目标分支'),
      headBranch: head.ref || requiredString(meta.source_branch, 'headBranch', '未知来源分支'),
      headSha,
      files: files.map(({ patch: _patch, changedNewLines: _lines, ...file }) => file),
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
      eligibleFiles: files.filter((file) => file.eligible).length,
      excludedFiles: files.filter((file) => !file.eligible).length,
      inputCharacters: totalCharacters,
      contextMode: 'remote-limited' as const
    }
    return { preview, files }
  }

  private async request(path: string, token: string): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000)
      })
    } catch (error) {
      if (error instanceof ReviewSourceError) throw error
      throw new ReviewSourceError('无法连接 GitCode，请检查网络后重试。', 'CONNECTION_FAILED')
    }
    if (response.status === 401 || response.status === 403) throw new ReviewSourceError('GitCode 认证失败，请检查 PAT 是否有效且具备仓库只读权限。', 'AUTHENTICATION_FAILED')
    if (response.status === 404) throw new ReviewSourceError('未找到该 GitCode PR，或当前 PAT 没有访问权限。', 'NOT_FOUND')
    if (response.status === 429) throw new ReviewSourceError('GitCode API 请求过于频繁，请稍后重试。', 'RATE_LIMITED')
    if (!response.ok) throw new ReviewSourceError(`GitCode API 请求失败（HTTP ${response.status}）。`, 'REQUEST_FAILED')
    try {
      return await response.json()
    } catch {
      throw new ReviewSourceError('GitCode 返回了无法读取的响应。', 'INVALID_RESPONSE')
    }
  }

  private async optionalRequest(path: string, token: string): Promise<unknown> {
    try {
      return await this.request(path, token)
    } catch {
      return null
    }
  }

  private parseMergeRequestSummary(value: unknown): GitCodeMergeRequestSummary | null {
    const item = recordValue(value)
    const webUrl = requiredString(item.html_url ?? item.web_url, 'htmlUrl')
    if (!webUrl) return null
    let locator: MergeRequestLocator
    try {
      locator = this.parseUrl(new URL(webUrl))
    } catch {
      return null
    }
    const base = branchValue(item.base ?? item.target)
    const head = branchValue(item.head ?? item.source)
    const user = recordValue(item.user ?? item.author)
    const headSha = head.sha || requiredString(item.head_sha ?? item.sha, 'headSha')
    const updatedAt = requiredString(item.updated_at ?? item.updatedAt, 'updatedAt') || null
    return {
      sourceId: `gitcode:${locator.owner}/${locator.repository}#${locator.number}@${headSha || 'unknown'}`,
      locator,
      title: requiredString(item.title, 'title', `PR #${locator.number}`),
      state: requiredString(item.state ?? item.status, 'state', 'open'),
      author: requiredString(user.name ?? user.login ?? user.username, 'author') || null,
      baseBranch: base.ref || requiredString(item.target_branch ?? item.base_branch, 'baseBranch', '未知目标分支'),
      headBranch: head.ref || requiredString(item.source_branch ?? item.head_branch, 'headBranch', '未知来源分支'),
      headSha,
      updatedAt,
      draft: item.draft === true || item.work_in_progress === true,
      review: { status: 'unreviewed' }
    }
  }
}
