import { definePreloadFeature } from '../../../platform/preload/define-feature'
import type { FrequentSkillsApi } from '../shared/api'
import { frequentSkillsChannels as channels } from '../shared/channels'

export const frequentSkillsPreloadFeature = definePreloadFeature({
  id: 'frequent-skills',
  provides: ['frequent-skills.preload'],
  channels: Object.values(channels),
  createApi(invoke): FrequentSkillsApi {
    return {
      frequentSkills: {
        list: () => invoke(channels.list),
        create: (input) => invoke(channels.create, input),
        update: (input) => invoke(channels.update, input),
        delete: (id) => invoke(channels.delete, id),
        importSkill: () => invoke(channels.import),
        execute: (id) => invoke(channels.execute, id)
      }
    }
  }
})
