import { describe, expect, it, vi } from 'vitest'
import { IpcHandlerRegistry, type IpcMainTarget } from '../src/platform/main/ipc'

describe('IPC handler lifecycle', () => {
  it('allows only declared channels, rejects duplicates, and removes registered handlers', () => {
    const target: IpcMainTarget = { handle: vi.fn(), removeHandler: vi.fn() }
    const registry = new IpcHandlerRegistry(target)
    const channel = 'feature:example:read'
    const first = registry.forFeature('example', [channel])
    const second = registry.forFeature('other', [channel])

    expect(() => first.handle('feature:example:undeclared', vi.fn())).toThrow(/未声明/)
    first.handle(channel, vi.fn())
    expect(() => second.handle(channel, vi.fn())).toThrow(/已注册/)

    registry.dispose()
    expect(target.removeHandler).toHaveBeenCalledWith(channel)
  })
})
