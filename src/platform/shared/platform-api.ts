import type { AiProviderApi } from '../ai-provider/shared/contracts'

export type PlatformApi = AiProviderApi & {
  app: {
    getVersion(): Promise<string>
  }
}

export const platformChannels = {
  getVersion: 'platform:app:get-version',
  getProviders: 'platform:ai-provider:get-state',
  createProvider: 'platform:ai-provider:create',
  updateProvider: 'platform:ai-provider:update',
  deleteProvider: 'platform:ai-provider:delete',
  setActiveProvider: 'platform:ai-provider:set-active',
  testProvider: 'platform:ai-provider:test',
  refreshExternalProviders: 'platform:ai-provider:refresh-external'
} as const
