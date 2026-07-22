import { Settings } from 'lucide-react'
import { defineRendererFeature } from '../../../platform/renderer/define-feature'

export const settingsFeature = defineRendererFeature({
  id: 'settings',
  order: 100,
  navigation: { label: '设置', icon: Settings, group: 'system' },
  route: {
    path: '/settings',
    load: () => import('./SettingsPage').then(({ SettingsPage }) => ({ default: SettingsPage }))
  },
  status: 'stable',
  requires: ['ai-inspector.renderer', 'code-review.renderer']
})
