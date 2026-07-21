import { describe, expect, it } from 'vitest'
import { ProviderSettingsManager, type ProviderSettingsStorage, type SecretCrypto } from '../src/main/services/provider-settings'

class MemoryStorage implements ProviderSettingsStorage {
  values = new Map<string, unknown>()
  get(key: string): unknown { return this.values.get(key) }
  set(key: string, value: unknown): void { this.values.set(key, value) }
  delete(key: string): void { this.values.delete(key) }
}

const crypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(`encrypted:${value}`).toString('base64'),
  decrypt: (value) => Buffer.from(value, 'base64').toString().replace('encrypted:', '')
}

describe('ProviderSettingsManager', () => {
  it('stores only encrypted key material and never exposes the key publicly', () => {
    const storage = new MemoryStorage()
    const manager = new ProviderSettingsManager(storage, crypto)
    const publicSettings = manager.update({ baseUrl: 'https://example.com/v1/', model: 'demo', apiKey: 'top-secret' })
    expect(publicSettings).toEqual({ provider: 'openai-compatible', baseUrl: 'https://example.com/v1', model: 'demo', apiKeyConfigured: true })
    expect(JSON.stringify([...storage.values])).not.toContain('top-secret')
    expect(manager.getSecret()).toMatchObject({ apiKey: 'top-secret' })
  })

  it('retains an existing key when an update omits apiKey', () => {
    const manager = new ProviderSettingsManager(new MemoryStorage(), crypto)
    manager.update({ baseUrl: 'https://one.example/v1', model: 'first', apiKey: 'key-one' })
    manager.update({ baseUrl: 'https://two.example/v1', model: 'second' })
    expect(manager.getSecret()).toEqual({ baseUrl: 'https://two.example/v1', model: 'second', apiKey: 'key-one' })
  })

  it('refuses plaintext fallback when secure storage is unavailable', () => {
    const manager = new ProviderSettingsManager(new MemoryStorage(), { ...crypto, isAvailable: () => false })
    expect(() => manager.update({ baseUrl: 'https://example.com/v1', model: 'demo', apiKey: 'key' })).toThrow(/安全存储/)
  })

  it('can explicitly clear the encrypted key', () => {
    const manager = new ProviderSettingsManager(new MemoryStorage(), crypto)
    manager.update({ baseUrl: 'https://example.com/v1', model: 'demo', apiKey: 'key' })
    const result = manager.update({ baseUrl: 'https://example.com/v1', model: 'demo', clearApiKey: true })
    expect(result.apiKeyConfigured).toBe(false)
    expect(() => manager.getSecret()).toThrow(/API Key/)
  })
})
