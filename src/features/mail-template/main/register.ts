import { dialog, shell } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { defineMainFeature } from '../../../platform/main/define-feature'
import { mailTemplateChannels } from '../shared/channels'
import { buildMailtoUri } from './mailto'
import { importOutlookMessage } from './message-import'

export const mailTemplateMainFeature = defineMainFeature({
  id: 'mail-template',
  provides: ['mail-template.main'],
  channels: Object.values(mailTemplateChannels),
  register({ ipc }) {
    ipc.handle(mailTemplateChannels.openDraft, async (_event, draft: unknown) => {
      await shell.openExternal(buildMailtoUri(draft))
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
