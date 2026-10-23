import { definePreloadFeature } from '../../../platform/preload/define-feature'
import type { DefectManagerApi } from '../shared/api'
import { defectChannels as channels } from '../shared/channels'

export const defectManagerPreloadFeature = definePreloadFeature({
  id: 'defect-manager',
  channels: Object.values(channels),
  createApi(invoke): DefectManagerApi {
    return { defects: {
      list: () => invoke(channels.list),
      save: (input) => invoke(channels.save, input),
      remove: (id) => invoke(channels.remove, id),
      image: (recordId, assetId, full) => invoke(channels.image, recordId, assetId, full),
      openAnalysis: (id) => invoke(channels.openAnalysis, id),
      openDts: (id) => invoke(channels.openDts, id),
      exportMarkdown: (ids) => invoke(channels.exportMarkdown, ids)
    } }
  }
})
