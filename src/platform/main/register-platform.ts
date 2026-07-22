import { app } from 'electron'
import { platformChannels } from '../shared/platform-api'
import { registerMainFeatures } from './feature-registry'
import { IpcHandlerRegistry } from './ipc'

const platformIpcDefinition = {
  id: 'platform',
  channels: Object.values(platformChannels)
} as const

export async function registerApplication(): Promise<() => void> {
  const registry = new IpcHandlerRegistry()
  try {
    const ipc = registry.forFeature(platformIpcDefinition.id, platformIpcDefinition.channels)
    ipc.handle(platformChannels.getVersion, () => app.getVersion())
    await registerMainFeatures(registry)
    return () => registry.dispose()
  } catch (reason) {
    registry.dispose()
    throw reason
  }
}
