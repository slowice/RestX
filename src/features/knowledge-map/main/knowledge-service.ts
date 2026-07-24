import { mkdir } from 'node:fs/promises'
import type { ResolvedAiProvider } from '../../../platform/ai-provider/shared/contracts'
import type {
  ApplyKnowledgeClassificationInput,
  KnowledgeClassificationSuggestion,
  KnowledgeProblemDetail,
  KnowledgeScanResult
} from '../shared/contracts'
import { buildKnowledgeGraph, buildKnowledgeLabelCatalog } from '../shared/knowledge-catalog'
import { classifyKnowledgeProblem } from './services/knowledge-classifier'
import {
  KnowledgeFileAccessError,
  readSafeKnowledgeFile
} from './services/knowledge-file-access'
import { parseKnowledgeMarkdown, type ParsedKnowledgeMarkdown } from './services/markdown-parser'
import { applyKnowledgeClassification } from './services/markdown-writer'
import { scanKnowledgeRoot } from './services/knowledge-scanner'

type ExecuteActive = <T>(operation: (provider: ResolvedAiProvider) => Promise<T>) => Promise<T>

type KnowledgeServiceDependencies = {
  root: string
  openPath(path: string): Promise<string>
  executeActive: ExecuteActive
  now?: () => Date
  fetchImpl?: typeof fetch
}

export class KnowledgeServiceError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'KnowledgeServiceError'
  }
}

export class KnowledgeService {
  private snapshot = new Map<string, ParsedKnowledgeMarkdown & { absolutePath: string }>()
  private latestResult: KnowledgeScanResult | null = null

  constructor(private readonly dependencies: KnowledgeServiceDependencies) {}

  async scan(): Promise<KnowledgeScanResult> {
    const snapshot = await scanKnowledgeRoot(this.dependencies.root)
    this.snapshot = new Map(snapshot.problems.map((problem) => [problem.summary.id, problem]))
    const problems = snapshot.problems.map((problem) => problem.summary)
    const result: KnowledgeScanResult = {
      rootDisplayPath: '~/.restx/knowledge',
      scannedAt: (this.dependencies.now?.() ?? new Date()).toISOString(),
      problems,
      graph: buildKnowledgeGraph(problems),
      catalog: buildKnowledgeLabelCatalog(problems),
      skipped: snapshot.skipped
    }
    this.latestResult = result
    return result
  }

  async read(problemId: string): Promise<KnowledgeProblemDetail> {
    const registered = await this.currentProblem(problemId)
    const source = await this.readCurrentFile(registered.absolutePath)
    const parsed = parseKnowledgeMarkdown(source.content, problemId, {
      sizeBytes: source.sizeBytes,
      modifiedAt: source.modifiedAt
    })
    return { ...parsed.summary, markdown: parsed.body }
  }

  async classify(problemId: string): Promise<KnowledgeClassificationSuggestion> {
    const registered = await this.currentProblem(problemId)
    const source = await this.readCurrentFile(registered.absolutePath)
    const parsed = parseKnowledgeMarkdown(source.content, problemId)
    if (parsed.summary.status === 'invalid') {
      throw new KnowledgeServiceError('请先修复问题文件的 Frontmatter。', 'INVALID_FRONTMATTER')
    }
    const result = this.latestResult ?? await this.scan()
    return this.dependencies.executeActive((provider) => classifyKnowledgeProblem({
      problemId,
      sourceFingerprint: parsed.summary.sourceFingerprint,
      markdown: parsed.body,
      catalog: result.catalog,
      provider,
      fetchImpl: this.dependencies.fetchImpl
    }))
  }

  async apply(input: ApplyKnowledgeClassificationInput): Promise<KnowledgeScanResult> {
    await this.currentProblem(input.problemId)
    await applyKnowledgeClassification({
      root: this.dependencies.root,
      input,
      now: this.dependencies.now
    })
    return this.scan()
  }

  async open(problemId: string): Promise<void> {
    const problem = await this.currentProblem(problemId)
    await this.readCurrentFile(problem.absolutePath)
    const error = await this.dependencies.openPath(problem.absolutePath)
    if (error) throw new KnowledgeServiceError('无法使用系统默认应用打开问题文件。', 'OPEN_FAILED')
  }

  async openRoot(): Promise<void> {
    await mkdir(this.dependencies.root, { recursive: true, mode: 0o700 })
    const error = await this.dependencies.openPath(this.dependencies.root)
    if (error) throw new KnowledgeServiceError('无法打开知识目录。', 'OPEN_FAILED')
  }

  private async currentProblem(problemId: string): Promise<ParsedKnowledgeMarkdown & { absolutePath: string }> {
    if (!this.latestResult) await this.scan()
    const problem = this.snapshot.get(problemId)
    if (!problem) throw new KnowledgeServiceError('问题不在当前扫描结果中，请刷新知识库。', 'STALE_PROBLEM')
    return problem
  }

  private async readCurrentFile(
    absolutePath: string
  ): Promise<{ content: string; sizeBytes: number; modifiedAt: Date }> {
    try {
      return await readSafeKnowledgeFile(this.dependencies.root, absolutePath)
    } catch (error) {
      if (error instanceof KnowledgeFileAccessError) {
        throw new KnowledgeServiceError(error.message, error.code)
      }
      throw error
    }
  }
}
