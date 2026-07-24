import type {
  ApplyKnowledgeClassificationInput,
  KnowledgeClassificationSuggestion,
  KnowledgeProblemDetail,
  KnowledgeScanResult
} from './contracts'

export type KnowledgeMapApi = {
  knowledge: {
    scan(): Promise<KnowledgeScanResult>
    read(problemId: string): Promise<KnowledgeProblemDetail>
    classify(problemId: string): Promise<KnowledgeClassificationSuggestion>
    apply(input: ApplyKnowledgeClassificationInput): Promise<KnowledgeScanResult>
    open(problemId: string): Promise<void>
    openRoot(): Promise<void>
  }
}

