import type {
  CodeHubPublicSettings,
  CodeHubSettingsInput,
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
    getCodeHubSettings(): Promise<CodeHubPublicSettings>
    updateCodeHubSettings(input: CodeHubSettingsInput): Promise<CodeHubPublicSettings>
    clearCache(): Promise<{ cleared: number }>
  }
}
