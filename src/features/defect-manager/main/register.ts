import { dialog, shell } from 'electron'
import path from 'node:path'
import { defineMainFeature } from '../../../platform/main/define-feature'
import { getRestxStorageLayout } from '../../../platform/main/storage'
import { defectChannels as channels } from '../shared/channels'
import { assertId, DefectStore, validateDtsUrl } from './defect-store'

const store = new DefectStore(path.join(getRestxStorageLayout().root, 'defects'))

export const defectManagerMainFeature = defineMainFeature({
  id: 'defect-manager',
  channels: Object.values(channels),
  register({ ipc }) {
    ipc.handle(channels.list, () => store.list())
    ipc.handle(channels.save, (_event, input: unknown) => store.save(input))
    ipc.handle(channels.remove, (_event, id: unknown) => store.remove(id))
    ipc.handle(channels.image, (_event, recordId: unknown, assetId: unknown, full: unknown) => store.image(recordId, assetId, full))
    ipc.handle(channels.openAnalysis, async (_event, id: unknown) => {
      const result = await shell.openPath(await store.analysisPath(id))
      if (result) throw new Error('无法打开分析文件，请为 .md 文件配置默认打开程序。')
    })
    ipc.handle(channels.openDts, async (_event, id: unknown) => {
      const record = await store.find(id)
      validateDtsUrl(record.dtsUrl)
      if (!record.dtsUrl) throw new Error('尚未添加 DTS 链接。')
      await shell.openExternal(record.dtsUrl)
    })
    ipc.handle(channels.exportMarkdown, async (_event, ids: unknown) => {
      if (!Array.isArray(ids) || !ids.length || ids.length > 5000) throw new Error('请选择要导出的记录。')
      ids.forEach(assertId)
      const result = await dialog.showOpenDialog({ title: '选择导出目录（将新建列表和附件文件夹）', properties: ['openDirectory', 'createDirectory'] })
      if (result.canceled || !result.filePaths[0]) return null
      return store.exportMarkdown(ids, result.filePaths[0])
    })
  }
})
