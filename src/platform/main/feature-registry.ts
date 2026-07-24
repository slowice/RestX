import { aiInspectorMainFeature } from '../../features/ai-inspector/main/register'
import { codeReviewMainFeature } from '../../features/code-review/main/register'
import { mailTemplateMainFeature } from '../../features/mail-template/main/register'
import { knowledgeMapMainFeature } from '../../features/knowledge-map/main/register'
import { validateFeatureDefinitions, validateUniqueChannels } from '../shared/feature-validation'
import type { MainFeature } from './define-feature'
import type { IpcHandlerRegistry } from './ipc'

const registeredFeatures = [aiInspectorMainFeature, codeReviewMainFeature, knowledgeMapMainFeature, mailTemplateMainFeature] satisfies readonly MainFeature[]

export const mainFeatures = validateFeatureDefinitions(registeredFeatures)

validateUniqueChannels(mainFeatures)

export async function registerMainFeatures(registry: IpcHandlerRegistry): Promise<void> {
  for (const feature of mainFeatures) {
    await feature.register({ ipc: registry.forFeature(feature.id, feature.channels) })
  }
}
