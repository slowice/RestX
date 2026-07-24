import { Network } from 'lucide-react'
import { defineRendererFeature } from '../../../platform/renderer/define-feature'

export const knowledgeMapFeature = defineRendererFeature({
  id: 'knowledge-map',
  order: 20,
  navigation: { label: '知识图谱', icon: Network, group: 'primary' },
  route: {
    path: '/knowledge',
    load: () => import('./KnowledgeMapPage').then(({ KnowledgeMapPage }) => ({ default: KnowledgeMapPage }))
  },
  status: 'stable',
  provides: ['knowledge-map.renderer']
})

