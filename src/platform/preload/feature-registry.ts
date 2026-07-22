import { aiInspectorPreloadFeature } from '../../features/ai-inspector/preload/api'
import { codeReviewPreloadFeature } from '../../features/code-review/preload/api'
import { validateFeatureDefinitions, validateUniqueChannels } from '../shared/feature-validation'
import type { PreloadFeature, PreloadInvoke } from './define-feature'

const registeredFeatures = [aiInspectorPreloadFeature, codeReviewPreloadFeature] satisfies readonly PreloadFeature[]

export const preloadFeatures = validateFeatureDefinitions(registeredFeatures)

validateUniqueChannels(preloadFeatures)

export function createFeatureApiContributions(invoke: PreloadInvoke): object[] {
  return preloadFeatures.map((feature) => feature.createApi(invoke))
}
