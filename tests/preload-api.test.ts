import { describe, expect, it, vi } from 'vitest'
import type { RestXApi } from '../src/app-api'
import { aiInspectorChannels } from '../src/features/ai-inspector/shared/channels'
import { createFeatureApiContributions } from '../src/platform/preload/feature-registry'
import type { PreloadInvoke } from '../src/platform/preload/define-feature'
import { composeApiContributions, createPlatformApi } from '../src/platform/preload/expose-api'
import { platformChannels } from '../src/platform/shared/platform-api'

describe('preload API composition', () => {
  it('deep-merges platform and feature methods while keeping fixed channels', async () => {
    const calls = vi.fn()
    const invoke: PreloadInvoke = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
      calls(channel, ...args)
      return channel as T
    }
    const api = composeApiContributions([
      createPlatformApi(invoke),
      ...createFeatureApiContributions(invoke)
    ]) as RestXApi

    await api.app.getVersion()
    await api.app.getPreferences()
    await api.inspector.chooseDirectory()

    expect(calls).toHaveBeenNthCalledWith(1, platformChannels.getVersion)
    expect(calls).toHaveBeenNthCalledWith(2, aiInspectorChannels.getPreferences)
    expect(calls).toHaveBeenNthCalledWith(3, aiInspectorChannels.chooseDirectory)
  })

  it('rejects duplicate API methods', () => {
    expect(() => composeApiContributions([
      { app: { getVersion: vi.fn() } },
      { app: { getVersion: vi.fn() } }
    ])).toThrow(/API 方法重复/)
  })
})
