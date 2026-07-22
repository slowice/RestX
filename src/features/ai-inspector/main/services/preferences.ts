import Store from 'electron-store'
import type { AppPreferences } from '../../shared/api'

type StoreShape = AppPreferences

const store = new Store<StoreShape>({
  name: 'preferences',
  defaults: {
    recentDirectory: null,
    aiLocalAnalysisEnabled: false
  }
})

export const preferences = {
  get(): AppPreferences {
    return {
      recentDirectory: store.get('recentDirectory'),
      aiLocalAnalysisEnabled: store.get('aiLocalAnalysisEnabled')
    }
  },
  setRecentDirectory(directory: string): void {
    store.set('recentDirectory', directory)
  },
  setAiLocalAnalysisEnabled(enabled: boolean): AppPreferences {
    store.set('aiLocalAnalysisEnabled', enabled)
    return this.get()
  },
  clearHistory(): AppPreferences {
    store.set('recentDirectory', null)
    return this.get()
  }
}
