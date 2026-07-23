import type {
  CodeReviewResult,
  GitCodeConnectionStatus,
  GitCodeMergeRequestList,
  GitCodePublicSettings,
  GitCodeSettingsInput,
  PreviewReviewSourceInput,
  ReviewSourcePreview,
  RunCodeReviewInput
} from './contracts/code-review'

export type CodeReviewApi = {
  codeReview: {
    listMyGitCodeMergeRequests(): Promise<GitCodeMergeRequestList>
    previewSource(input: PreviewReviewSourceInput): Promise<ReviewSourcePreview>
    run(input: RunCodeReviewInput): Promise<CodeReviewResult>
    getGitCodeSettings(): Promise<GitCodePublicSettings>
    updateGitCodeSettings(input: GitCodeSettingsInput): Promise<GitCodePublicSettings>
    testGitCodeConnection(): Promise<GitCodeConnectionStatus>
    clearCache(): Promise<{ cleared: number }>
  }
}
