import { definePreloadFeature } from '../../../platform/preload/define-feature'
import type { CodeReviewApi } from '../shared/api'
import { codeReviewChannels as channels } from '../shared/channels'

export const codeReviewPreloadFeature = definePreloadFeature({
  id: 'code-review',
  provides: ['code-review.preload'],
  channels: Object.values(channels),
  createApi(invoke): CodeReviewApi {
    return {
      codeReview: {
        listMyGitCodeMergeRequests: () => invoke(channels.listMyGitCodeMergeRequests),
        previewSource: (input) => invoke(channels.previewSource, input),
        run: (input) => invoke(channels.run, input),
        getGitCodeSettings: () => invoke(channels.getGitCodeSettings),
        updateGitCodeSettings: (input) => invoke(channels.updateGitCodeSettings, input),
        testGitCodeConnection: () => invoke(channels.testGitCodeConnection),
        clearCache: () => invoke(channels.clearCache)
      }
    }
  }
})
