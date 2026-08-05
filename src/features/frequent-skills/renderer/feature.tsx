import { WandSparkles } from 'lucide-react'
import { defineRendererFeature } from '../../../platform/renderer/define-feature'

export const frequentSkillsFeature = defineRendererFeature({
  id: 'frequent-skills',
  order: 24,
  navigation: { label: '常用技能', icon: WandSparkles, group: 'primary' },
  route: {
    path: '/frequent-skills',
    load: () => import('./FrequentSkillsPage').then(({ FrequentSkillsPage }) => ({ default: FrequentSkillsPage }))
  },
  status: 'stable'
})
