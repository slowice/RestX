import { FileSearch } from 'lucide-react'
import { defineRendererFeature } from '../../../platform/renderer/define-feature'

export const codeReviewFeature = defineRendererFeature({
  id: 'code-review',
  order: 30,
  navigation: { label: '代码自检', icon: FileSearch, group: 'primary' },
  route: {
    path: '/code-review',
    load: () => import('./CodeReviewPage').then(({ CodeReviewPage }) => ({ default: CodeReviewPage }))
  },
  status: 'stable',
  provides: ['code-review.renderer']
})
