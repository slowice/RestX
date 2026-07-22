import { Home } from 'lucide-react'
import { defineRendererFeature } from '../../../platform/renderer/define-feature'

export const homeFeature = defineRendererFeature({
  id: 'home',
  order: 10,
  navigation: { label: '首页', icon: Home, group: 'primary' },
  route: {
    path: '/home',
    load: () => import('./HomePage').then(({ HomePage }) => ({ default: HomePage }))
  },
  status: 'stable',
  requires: ['ai-inspector.renderer']
})
