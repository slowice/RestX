import { dialog } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { defineMainFeature } from '../../../platform/main/define-feature'
import { mailTemplateChannels } from '../shared/channels'
import { importOutlookMessage } from './message-import'
import { openClassicOutlookDraft } from './outlook-draft'

export const mailTemplateMainFeature = defineMainFeature({
  id: 'mail-template',
  provides: ['mail-template.main'],
  channels: Object.values(mailTemplateChannels),
  register({ ipc }) {
    ipc.handle(mailTemplateChannels.openDraft, async (_event, draft: unknown) => {
      await openClassicOutlookDraft(draft)
    })
    ipc.handle(mailTemplateChannels.importMessage, () => importOutlookMessage({
      selectFile: async () => {
        const result = await dialog.showOpenDialog({
          title: '选择 Outlook 邮件文件',
          properties: ['openFile', 'dontAddToRecent'],
          filters: [{ name: 'Outlook 邮件', extensions: ['eml', 'msg'] }]
        })
        return result.canceled ? null : result.filePaths[0] ?? null
      },
      stat,
      readFile
    }))
  }
})
