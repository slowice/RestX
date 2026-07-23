import { app } from 'electron'
import type { CreateAiProviderInput, UpdateAiProviderInput } from '../ai-provider/shared/contracts'
import { aiProviderRegistry } from '../ai-provider/main/provider-registry'
import { platformChannels } from '../shared/platform-api'
import { registerMainFeatures } from './feature-registry'
import { IpcHandlerRegistry } from './ipc'

const platformIpcDefinition = {
  id: 'platform',
  channels: Object.values(platformChannels)
} as const

function assertId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 200) throw new Error('Provider ID 无效。')
}

function assertCreateProvider(value: unknown): asserts value is CreateAiProviderInput {
  if (!value || typeof value !== 'object') throw new Error('Provider 配置无效。')
  const input = value as Record<string, unknown>
  for (const field of ['name', 'baseUrl', 'modelId', 'apiKey']) {
    if (typeof input[field] !== 'string' || !(input[field] as string).trim()) throw new Error(`${field} 参数无效。`)
  }
}

function assertUpdateProvider(value: unknown): asserts value is UpdateAiProviderInput {
  if (!value || typeof value !== 'object') throw new Error('Provider 配置无效。')
  const input = value as Record<string, unknown>
  for (const field of ['id', 'name', 'baseUrl', 'modelId']) {
    if (typeof input[field] !== 'string' || !(input[field] as string).trim()) throw new Error(`${field} 参数无效。`)
  }
  if (input.apiKey !== undefined && typeof input.apiKey !== 'string') throw new Error('apiKey 参数无效。')
}

export async function registerApplication(): Promise<() => void> {
  const registry = new IpcHandlerRegistry()
  try {
    const ipc = registry.forFeature(platformIpcDefinition.id, platformIpcDefinition.channels)
    ipc.handle(platformChannels.getVersion, () => app.getVersion())
    await aiProviderRegistry.initialize()
    ipc.handle(platformChannels.getProviders, () => aiProviderRegistry.getState())
    ipc.handle(platformChannels.createProvider, (_event, input: unknown) => {
      assertCreateProvider(input)
      return aiProviderRegistry.create(input)
    })
    ipc.handle(platformChannels.updateProvider, (_event, input: unknown) => {
      assertUpdateProvider(input)
      return aiProviderRegistry.update(input)
    })
    ipc.handle(platformChannels.deleteProvider, (_event, id: unknown) => {
      assertId(id)
      return aiProviderRegistry.delete(id)
    })
    ipc.handle(platformChannels.setActiveProvider, (_event, id: unknown) => {
      assertId(id)
      return aiProviderRegistry.setActive(id)
    })
    ipc.handle(platformChannels.testProvider, (_event, id: unknown) => {
      assertId(id)
      return aiProviderRegistry.test(id)
    })
    ipc.handle(platformChannels.refreshExternalProviders, () => aiProviderRegistry.refreshExternal())
    await registerMainFeatures(registry)
    return () => registry.dispose()
  } catch (reason) {
    registry.dispose()
    throw reason
  }
}
