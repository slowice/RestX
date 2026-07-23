import { describe, expect, it } from 'vitest'
import { CodeHubSettingsManager } from '../src/features/code-review/main/services/codehub-settings'
import type { ProviderSettingsStorage, SecretCrypto } from '../src/features/code-review/main/services/gitcode-settings'

class MemoryStorage implements ProviderSettingsStorage {
  readonly values = new Map<string, unknown>()
  get(key: string): unknown { return this.values.get(key) }
  set(key: string, value: unknown): void { this.values.set(key, value) }
  delete(key: string): void { this.values.delete(key) }
}

const crypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(value).toString('base64'),
  decrypt: (value) => Buffer.from(value, 'base64').toString()
}

describe('CodeHubSettingsManager', () => {
  it('encrypts, replaces, reads, and removes PRIVATE-TOKEN without exposing it publicly', () => {
    const storage = new MemoryStorage()
    const manager = new CodeHubSettingsManager(storage, crypto)

    expect(manager.getPublic()).toEqual({ privateTokenConfigured: false })
    expect(manager.update({ privateToken: ' first-secret ' })).toEqual({ privateTokenConfigured: true })
    expect(storage.get('encryptedPrivateToken')).not.toBe('first-secret')
    expect(manager.getSecret()).toBe('first-secret')

    manager.update({ privateToken: 'replacement' })
    expect(manager.getSecret()).toBe('replacement')
    expect(manager.update({ clearPrivateToken: true })).toEqual({ privateTokenConfigured: false })
    expect(manager.getSecret()).toBe('')
  })

  it('rejects unsafe or ambiguous updates', () => {
    const manager = new CodeHubSettingsManager(new MemoryStorage(), { ...crypto, isAvailable: () => false })
    expect(() => manager.update({ privateToken: 'secret' })).toThrow(/安全存储/)
    expect(() => manager.update({ privateToken: 'secret', clearPrivateToken: true })).toThrow(/同时设置和清除/)
  })
})
