import { ScanSearch } from 'lucide-react'
import { defineRendererFeature } from '../../../platform/renderer/define-feature'
import { InspectorStateProvider } from './state/InspectorState'

export const aiInspectorFeature = defineRendererFeature({
  id: 'ai-inspector',
  order: 20,
  navigation: { label: 'AI Inspector', icon: ScanSearch, group: 'primary' },
  route: {
    path: '/ai-inspector',
    load: () => import('./pages/InspectorPage').then(({ InspectorPage }) => ({ default: InspectorPage }))
  },
  status: 'stable',
  provides: ['ai-inspector.renderer'],
  Provider: InspectorStateProvider
})
