import { ClipboardList } from 'lucide-react'
import { defineRendererFeature } from '../../../platform/renderer/define-feature'

export const defectManagerFeature = defineRendererFeature({
  id: 'defect-manager',
  order: 25,
  navigation: { label: '缺陷管理', icon: ClipboardList, group: 'primary' },
  route: {
    path: '/defects',
    load: () => import('./DefectManagerPage').then(({ DefectManagerPage }) => ({ default: DefectManagerPage }))
  },
  status: 'stable'
})
