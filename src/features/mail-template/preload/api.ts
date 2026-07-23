import { definePreloadFeature } from '../../../platform/preload/define-feature'
import type { MailTemplateApi } from '../shared/contracts'
import { mailTemplateChannels as channels } from '../shared/channels'

export const mailTemplatePreloadFeature = definePreloadFeature({
  id: 'mail-template',
  provides: ['mail-template.preload'],
  channels: Object.values(channels),
  createApi(invoke): MailTemplateApi {
    return {
      mailTemplates: {
        openDraft: (draft) => invoke(channels.openDraft, draft),
        importMessage: () => invoke(channels.importMessage)
      }
    }
  }
})
