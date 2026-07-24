import { aiInspectorFeature } from '../../features/ai-inspector/renderer/feature'
import { codeReviewFeature } from '../../features/code-review/renderer/feature'
import { homeFeature } from '../../features/home/renderer/feature'
import { labFeature } from '../../features/lab/renderer/feature'
import { knowledgeMapFeature } from '../../features/knowledge-map/renderer/feature'
import { mailTemplateFeature } from '../../features/mail-template/renderer/feature'
import { settingsFeature } from '../../features/settings/renderer/feature'
import { validateFeatureDefinitions } from '../shared/feature-validation'
import type { RendererFeature } from './define-feature'

const registeredFeatures = [homeFeature, aiInspectorFeature, knowledgeMapFeature, codeReviewFeature, mailTemplateFeature, labFeature, settingsFeature] satisfies readonly RendererFeature[]

export type RendererFeatureRegistry = {
  features: RendererFeature[]
  navigation: RendererFeature[]
  defaultRoute: string
}

export function createRendererFeatureRegistry(features: readonly RendererFeature[]): RendererFeatureRegistry {
  const validated = [...validateFeatureDefinitions(features, { getRoute: (feature) => feature.route.path })]
    .sort((left, right) => left.order - right.order)
  return {
    features: validated,
    navigation: validated.filter((feature) => feature.navigation),
    defaultRoute: validated.find((feature) => feature.id === 'home')?.route.path ?? validated[0]?.route.path ?? '/'
  }
}

const registry = createRendererFeatureRegistry(registeredFeatures)

export const rendererFeatures = registry.features
export const navigationFeatures = registry.navigation
export const defaultFeatureRoute = registry.defaultRoute
