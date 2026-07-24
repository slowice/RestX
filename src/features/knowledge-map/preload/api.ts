import { definePreloadFeature } from '../../../platform/preload/define-feature'
import type { KnowledgeMapApi } from '../shared/api'
import { knowledgeMapChannels as channels } from '../shared/channels'

export const knowledgeMapPreloadFeature = definePreloadFeature({
  id: 'knowledge-map',
  provides: ['knowledge-map.preload'],
  channels: Object.values(channels),
  createApi(invoke): KnowledgeMapApi {
    return {
      knowledge: {
        scan: () => invoke(channels.scan),
        read: (problemId) => invoke(channels.read, problemId),
        classify: (problemId) => invoke(channels.classify, problemId),
        apply: (input) => invoke(channels.apply, input),
        open: (problemId) => invoke(channels.open, problemId),
        openRoot: () => invoke(channels.openRoot)
      }
    }
  }
})

