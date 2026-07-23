import { createHash, randomUUID } from 'node:crypto'
import type { CodeReviewResult, GitCodeConnectionStatus, GitCodeMergeRequestList, PreviewReviewSourceInput, ReviewFinding, ReviewSourcePreview, RunCodeReviewInput } from '../../shared/contracts/code-review'
import type { AiProviderPublic, ResolvedAiProvider } from '../../../../platform/ai-provider/shared/contracts'
import { aiProviderRegistry } from '../../../../platform/ai-provider/main/provider-registry'
import { CodeHubAdapter } from './codehub-adapter'
import { buildReviewBatches, CODE_REVIEW_PROMPT_VERSION, reviewCodeBatch } from './code-review-provider'
import { MergeRequestAdapterRegistry, ReviewSourceError } from './code-review-source'
import { getCodeReviewCache, type CodeReviewCache } from './code-review-cache'
import { GitCodeAdapter, GITCODE_API_BASE_URL } from './gitcode-adapter'
import { gitCodeSettings } from './gitcode-settings'
import { readGlobalGitEmail } from './local-git-identity'
import { selectReviewRulePacks } from './review-rule-packs'
import { writeReviewAudit } from './review-audit-logger'

export class CodeReviewService {
  constructor(
    private readonly reviewCache?: CodeReviewCache,
    private readonly gitCode = new GitCodeAdapter({ getAccessToken: () => gitCodeSettings.getSecret() }),
    private readonly readGitEmail: () => Promise<string | null> = readGlobalGitEmail,
    private readonly providers: {
      getActivePublic(): Promise<AiProviderPublic>
      execute<T>(id: string, operation: (provider: ResolvedAiProvider) => Promise<T>): Promise<T>
    } = aiProviderRegistry
  ) {}

  private registry(): MergeRequestAdapterRegistry {
    return new MergeRequestAdapterRegistry([this.gitCode, new CodeHubAdapter()])
  }

  async listMyGitCodeMergeRequests(): Promise<GitCodeMergeRequestList> {
    const list = await this.gitCode.listMine(await this.readGitEmail())
    const cache = this.reviewCache ?? getCodeReviewCache()
    return {
      ...list,
      mergeRequests: list.mergeRequests.map((mergeRequest) => ({
        ...mergeRequest,
        review: cache.getReviewState(mergeRequest.sourceId)
      }))
    }
  }

  async preview(input: PreviewReviewSourceInput): Promise<ReviewSourcePreview> {
    const { adapter, locator } = this.registry().resolve(input.url)
    if (adapter.zone !== input.zone || locator.zone !== input.zone) throw new ReviewSourceError(`该链接属于${adapter.zone === 'blue' ? '蓝区' : '黄区'}，不能使用当前区域。`, 'ZONE_MISMATCH')
    return (await adapter.load(locator)).preview
  }

  async run(input: RunCodeReviewInput): Promise<CodeReviewResult> {
    const { adapter, locator } = this.registry().resolve(input.url)
    if (adapter.zone !== input.zone || locator.zone !== input.zone) throw new ReviewSourceError('代码来源与所选数据区域不匹配，已阻止发送。', 'ZONE_MISMATCH')
    const source = await adapter.load(locator)
    const eligible = source.files.filter((file) => file.eligible)
    if (!eligible.length) throw new ReviewSourceError('该 MR 没有可发送的文本 diff。', 'NO_ELIGIBLE_CHANGES')
    const rulePacks = selectReviewRulePacks(input.zone, eligible.map((file) => file.path))
    const provider = await this.providers.getActivePublic()
    const fingerprint = createHash('sha256').update(JSON.stringify({ sourceId: source.preview.sourceId, zone: input.zone, provider: provider.identityFingerprint, model: provider.modelId, baseUrl: provider.baseUrl, prompt: CODE_REVIEW_PROMPT_VERSION, rules: rulePacks.map((rule) => `${rule.id}@${rule.version}`), requirements: input.requirements?.trim() ?? '' })).digest('hex')
    const reviewId = randomUUID()
    const started = Date.now()
    const sourceHash = createHash('sha256').update(source.preview.sourceId).digest('hex')
    const cache = this.reviewCache ?? getCodeReviewCache()
    if (!input.force) {
      const cached = cache.get(fingerprint)
      if (cached) {
        await writeReviewAudit({ timestamp: new Date().toISOString(), reviewId, zone: input.zone, sourceHash, fileCount: eligible.length, inputCharacters: source.preview.inputCharacters, model: cached.model, durationMs: Date.now() - started, status: 'cache-hit', findingCount: cached.findings.length })
        return { ...cached, cacheStatus: 'hit' }
      }
    }
    const batches = buildReviewBatches(eligible, rulePacks, input.requirements)
    const findings: ReviewFinding[] = []
    const summaries: string[] = []
    let usedModel = provider.modelId
    try {
      for (const batch of batches) {
        const response = await this.providers.execute(provider.id, (resolved) => {
          usedModel = resolved.modelId
          return reviewCodeBatch({ settings: { baseUrl: resolved.baseUrl, model: resolved.modelId, apiKey: resolved.apiKey }, batch, rulePacks, requirements: input.requirements, sourceSummary: { title: source.preview.title, repository: `${locator.owner}/${locator.repository}`, baseBranch: source.preview.baseBranch, headBranch: source.preview.headBranch } })
        })
        summaries.push(response.summary)
        findings.push(...response.findings)
      }
      const unique = [...new Map(findings.map((finding) => [`${finding.filePath}:${finding.startLine}:${finding.title.toLowerCase()}`, finding])).values()]
        .sort((a, b) => ['P0', 'P1', 'P2', 'P3'].indexOf(a.severity) - ['P0', 'P1', 'P2', 'P3'].indexOf(b.severity) || a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine)
      const now = new Date()
      const result = cache.set(fingerprint, {
        reviewId,
        sourceId: source.preview.sourceId,
        summary: summaries.join(' ').slice(0, 20_000) || '检视完成。',
        findings: unique,
        reviewedFiles: eligible.length,
        excludedFiles: source.preview.excludedFiles,
        model: usedModel,
        rules: rulePacks.map(({ id, name, version }) => ({ id, name, version })),
        analyzedAt: now.toISOString(),
        cacheStatus: input.force ? 'refresh' : 'miss'
      })
      await writeReviewAudit({ timestamp: now.toISOString(), reviewId, zone: input.zone, sourceHash, fileCount: eligible.length, inputCharacters: source.preview.inputCharacters, model: usedModel, durationMs: Date.now() - started, status: 'success', findingCount: unique.length })
      return result
    } catch (error) {
      await writeReviewAudit({ timestamp: new Date().toISOString(), reviewId, zone: input.zone, sourceHash, fileCount: eligible.length, inputCharacters: source.preview.inputCharacters, model: usedModel, durationMs: Date.now() - started, status: 'failed' })
      throw error
    }
  }

  async testGitCodeConnection(fetchImpl: typeof fetch = fetch): Promise<GitCodeConnectionStatus> {
    const token = gitCodeSettings.getSecret().trim()
    if (!token) return { ok: false, message: '尚未配置 GitCode PAT。' }
    try {
      const response = await fetchImpl(`${GITCODE_API_BASE_URL}/user`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20_000) })
      if (response.status === 401 || response.status === 403) return { ok: false, message: 'PAT 无效或权限不足。' }
      if (!response.ok) return { ok: false, message: `GitCode 返回 HTTP ${response.status}。` }
      const value = await response.json() as Record<string, unknown>
      const account = typeof value.name === 'string' && value.name.trim() ? value.name : typeof value.login === 'string' ? value.login : undefined
      return { ok: true, ...(account ? { account } : {}), message: account ? `已连接：${account}` : 'GitCode 连接成功。' }
    } catch { return { ok: false, message: '无法连接 GitCode，请检查网络。' } }
  }
}

let serviceInstance: CodeReviewService | null = null
function getCodeReviewService(): CodeReviewService {
  serviceInstance ??= new CodeReviewService()
  return serviceInstance
}

export const codeReviewService = {
  listMyGitCodeMergeRequests: (): Promise<GitCodeMergeRequestList> => getCodeReviewService().listMyGitCodeMergeRequests(),
  preview: (input: PreviewReviewSourceInput): Promise<ReviewSourcePreview> => getCodeReviewService().preview(input),
  run: (input: RunCodeReviewInput): Promise<CodeReviewResult> => getCodeReviewService().run(input),
  testGitCodeConnection: (): Promise<GitCodeConnectionStatus> => getCodeReviewService().testGitCodeConnection()
}
