import type { ComponentType, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { FeatureDefinition } from '../shared/feature-types'

export type NavigationGroup = 'primary' | 'system' | 'experimental'
export type FeatureStatus = 'stable' | 'experimental'
export type FeaturePageModule = { default: ComponentType }

export type RendererFeature = FeatureDefinition & {
  order: number
  navigation?: {
    label: string
    icon: LucideIcon
    group: NavigationGroup
  }
  route: {
    path: string
    load: () => Promise<FeaturePageModule>
  }
  status?: FeatureStatus
  Provider?: ComponentType<{ children: ReactNode }>
}

export function defineRendererFeature<const T extends RendererFeature>(feature: T): T {
  return feature
}
