import type { PlatformApi } from '../shared/platform-api'
import { platformChannels } from '../shared/platform-api'
import type { PreloadInvoke } from './define-feature'

type ApiObject = Record<string, unknown>

export function createPlatformApi(invoke: PreloadInvoke): PlatformApi {
  return {
    app: {
      getVersion: () => invoke<string>(platformChannels.getVersion)
    },
    providers: {
      getState: () => invoke(platformChannels.getProviders),
      create: (input) => invoke(platformChannels.createProvider, input),
      update: (input) => invoke(platformChannels.updateProvider, input),
      delete: (id) => invoke(platformChannels.deleteProvider, id),
      setActive: (id) => invoke(platformChannels.setActiveProvider, id),
      test: (id) => invoke(platformChannels.testProvider, id),
      refreshExternal: () => invoke(platformChannels.refreshExternalProviders)
    }
  }
}

export function composeApiContributions(contributions: readonly object[]): ApiObject {
  const api: ApiObject = {}
  for (const contribution of contributions) mergeObject(api, contribution as ApiObject, [])
  return api
}

function mergeObject(target: ApiObject, source: ApiObject, path: string[]): void {
  for (const [key, value] of Object.entries(source)) {
    const location = [...path, key]
    const existing = target[key]
    if (isPlainObject(value)) {
      if (existing === undefined) target[key] = {}
      else if (!isPlainObject(existing)) throw new Error(`preload API 路径冲突：${location.join('.')}`)
      mergeObject(target[key] as ApiObject, value, location)
      continue
    }
    if (existing !== undefined) throw new Error(`preload API 方法重复：${location.join('.')}`)
    target[key] = value
  }
}

function isPlainObject(value: unknown): value is ApiObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
