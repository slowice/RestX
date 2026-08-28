import { definePreloadFeature } from '../../../platform/preload/define-feature'
import type { HomeApi } from '../shared/api'
import { homeChannels as channels } from '../shared/channels'

export const homePreloadFeature = definePreloadFeature({
  id: 'home',
  provides: ['home.preload'],
  channels: Object.values(channels),
  createApi(invoke): HomeApi {
    return {
      home: {
        getLoginState: () => invoke(channels.getLoginState),
        login: (input) => invoke(channels.login, input),
        getTaskTable: () => invoke(channels.getTaskTable),
        saveTaskTable: (table) => invoke(channels.saveTaskTable, table)
      }
    }
  }
})
