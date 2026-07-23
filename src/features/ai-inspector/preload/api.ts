import { definePreloadFeature } from '../../../platform/preload/define-feature'
import type { AiInspectorApi } from '../shared/api'
import { aiInspectorChannels as channels } from '../shared/channels'

export const aiInspectorPreloadFeature = definePreloadFeature({
  id: 'ai-inspector',
  provides: ['ai-inspector.preload'],
  channels: Object.values(channels),
  createApi(invoke): AiInspectorApi {
    return {
      inspector: {
        chooseDirectory: () => invoke(channels.chooseDirectory),
        scanDirectory: (directory) => invoke(channels.scanDirectory, directory),
        readConfig: (filePath) => invoke(channels.readConfig, filePath),
        readJsonlPage: (input) => invoke(channels.readJsonlPage, input),
        readJsonlEntry: (input) => invoke(channels.readJsonlEntry, input),
        searchJsonlWorkspace: (input) => invoke(channels.searchJsonlWorkspace, input),
        revealInFolder: (filePath) => invoke(channels.revealInFolder, filePath)
      },
      app: {
        getPreferences: () => invoke(channels.getPreferences),
        setAiLocalAnalysisEnabled: (enabled) => invoke(channels.setAiLocalAnalysisEnabled, enabled),
        clearHistory: () => invoke(channels.clearHistory)
      },
      ai: {
        analyzeConfig: (input) => invoke(channels.analyzeConfig, input),
        getCachedAnalysis: (filePath) => invoke(channels.getCachedAnalysis, filePath),
        clearAnalysisCache: () => invoke(channels.clearAnalysisCache)
      },
      presets: {
        list: () => invoke(channels.listPresets),
        generateDraft: (input) => invoke(channels.generatePresetDraft, input),
        save: (input) => invoke(channels.savePreset, input),
        setEnabled: (id, enabled) => invoke(channels.setPresetEnabled, id, enabled),
        delete: (id) => invoke(channels.deletePreset, id)
      }
    }
  }
})
