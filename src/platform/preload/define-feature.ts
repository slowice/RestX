import type { FeatureDefinition } from '../shared/feature-types'

export type PreloadInvoke = <T>(channel: string, ...args: unknown[]) => Promise<T>

export type PreloadFeature<TApi extends object = object> = FeatureDefinition & {
  channels: readonly string[]
  createApi(invoke: PreloadInvoke): TApi
}

export function definePreloadFeature<const T extends PreloadFeature>(feature: T): T {
  return feature
}
