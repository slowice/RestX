import type { IpcMainInvokeEvent } from 'electron'
import type { FeatureDefinition } from '../shared/feature-types'

export type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

export type FeatureIpcRegistrar = {
  handle(channel: string, handler: IpcHandler): void
}

export type MainFeatureContext = {
  ipc: FeatureIpcRegistrar
}

export type MainFeature = FeatureDefinition & {
  channels: readonly string[]
  register(context: MainFeatureContext): void | Promise<void>
}

export function defineMainFeature<const T extends MainFeature>(feature: T): T {
  return feature
}
