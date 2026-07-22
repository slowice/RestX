import { FlaskConical } from 'lucide-react'
import { defineRendererFeature } from '../../../platform/renderer/define-feature'

export const labFeature = defineRendererFeature({
  id: 'lab',
  order: 30,
  navigation: { label: '实验室', icon: FlaskConical, group: 'experimental' },
  route: {
    path: '/lab',
    load: () => import('./LabPage').then(({ LabPage }) => ({ default: LabPage }))
  },
  status: 'experimental'
})
