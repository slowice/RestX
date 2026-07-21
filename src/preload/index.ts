import { contextBridge, ipcRenderer } from 'electron'
import type { RestXApi } from '../shared/contracts/api'

const api: RestXApi = {
  inspector: {
    chooseDirectory: () => ipcRenderer.invoke('inspector:choose-directory'),
    scanDirectory: (directory) => ipcRenderer.invoke('inspector:scan-directory', directory),
    readConfig: (filePath) => ipcRenderer.invoke('inspector:read-config', filePath),
    readJsonlPage: (input) => ipcRenderer.invoke('inspector:read-jsonl-page', input),
    readJsonlEntry: (input) => ipcRenderer.invoke('inspector:read-jsonl-entry', input),
    revealInFolder: (filePath) => ipcRenderer.invoke('inspector:reveal-in-folder', filePath)
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPreferences: () => ipcRenderer.invoke('app:get-preferences'),
    setAiLocalAnalysisEnabled: (enabled) => ipcRenderer.invoke('app:set-ai-local-analysis-enabled', enabled),
    clearHistory: () => ipcRenderer.invoke('app:clear-history')
  },
  ai: {
    getRuntimeStatus: () => ipcRenderer.invoke('ai:get-runtime-status'),
    getProviderSettings: () => ipcRenderer.invoke('ai:get-provider-settings'),
    updateProviderSettings: (input) => ipcRenderer.invoke('ai:update-provider-settings', input),
    analyzeConfig: (input) => ipcRenderer.invoke('ai:analyze-config', input),
    getCachedAnalysis: (filePath) => ipcRenderer.invoke('ai:get-cached-analysis', filePath),
    clearAnalysisCache: () => ipcRenderer.invoke('ai:clear-analysis-cache')
  },
  presets: {
    list: () => ipcRenderer.invoke('presets:list'),
    generateDraft: (input) => ipcRenderer.invoke('presets:generate-draft', input),
    save: (input) => ipcRenderer.invoke('presets:save', input),
    setEnabled: (id, enabled) => ipcRenderer.invoke('presets:set-enabled', id, enabled),
    delete: (id) => ipcRenderer.invoke('presets:delete', id)
  }
}

contextBridge.exposeInMainWorld('restx', api)
