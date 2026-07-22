import type {
  CodeReviewResult,
  GitCodeConnectionStatus,
  GitCodePublicSettings,
  GitCodeSettingsInput,
  PreviewReviewSourceInput,
  ReviewSourcePreview,
  RunCodeReviewInput,
  UpdateZoneProviderInput,
  ZoneProviderSettings
} from './contracts/code-review'

export type CodeReviewApi = {
  codeReview: {
    previewSource(input: PreviewReviewSourceInput): Promise<ReviewSourcePreview>
    run(input: RunCodeReviewInput): Promise<CodeReviewResult>
    getGitCodeSettings(): Promise<GitCodePublicSettings>
    updateGitCodeSettings(input: GitCodeSettingsInput): Promise<GitCodePublicSettings>
    testGitCodeConnection(): Promise<GitCodeConnectionStatus>
    getZoneProviders(): Promise<ZoneProviderSettings>
    updateZoneProvider(input: UpdateZoneProviderInput): Promise<ZoneProviderSettings>
    clearCache(): Promise<{ cleared: number }>
  }
}
