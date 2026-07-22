import { ipcMain } from 'electron'
import type { FeatureIpcRegistrar, IpcHandler } from './define-feature'

export type IpcMainTarget = {
  handle(channel: string, handler: IpcHandler): void
  removeHandler(channel: string): void
}

export class IpcHandlerRegistry {
  private readonly owners = new Map<string, string>()

  constructor(private readonly target: IpcMainTarget = ipcMain) {}

  forFeature(featureId: string, declaredChannels: readonly string[]): FeatureIpcRegistrar {
    const allowlist = new Set(declaredChannels)
    return {
      handle: (channel, handler) => this.handle(featureId, allowlist, channel, handler)
    }
  }

  dispose(): void {
    for (const channel of this.owners.keys()) this.target.removeHandler(channel)
    this.owners.clear()
  }

  private handle(featureId: string, allowlist: ReadonlySet<string>, channel: string, handler: IpcHandler): void {
    if (!allowlist.has(channel)) throw new Error(`特性 ${featureId} 尝试注册未声明的 IPC channel：${channel}`)
    const owner = this.owners.get(channel)
    if (owner) throw new Error(`IPC channel 已注册：${channel}（${owner}）`)
    this.target.handle(channel, handler)
    this.owners.set(channel, featureId)
  }
}
