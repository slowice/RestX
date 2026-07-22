import { safeStorage } from 'electron'
import Store from 'electron-store'
import type { ReviewProviderPublicSettings, ReviewProviderSettingsInput, ReviewZone, ZoneProviderSettings } from '../../shared/contracts/code-review'
import { ProviderSettingsManager, type ProviderSecretSettings, type SecretCrypto } from './provider-settings'

type StoreShape = { baseUrl: string; model: string; encryptedApiKey?: string }

const managers = new Map<ReviewZone, ProviderSettingsManager>()

function getManager(zone: ReviewZone): ProviderSettingsManager {
  const existing = managers.get(zone)
  if (existing) return existing
  const defaultBaseUrl = zone === 'blue' ? 'https://api.openai.com/v1' : 'https://yellow-ai.internal/v1'
  const store = new Store<StoreShape>({
    name: `code-review-provider-${zone}`,
    defaults: { baseUrl: defaultBaseUrl, model: '' }
  })
  const crypto: SecretCrypto = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
  const manager = new ProviderSettingsManager(store, crypto, defaultBaseUrl)
  managers.set(zone, manager)
  return manager
}

export const reviewZoneSettings = {
  getAll(): ZoneProviderSettings {
    return { blue: getManager('blue').getPublic(), yellow: getManager('yellow').getPublic() }
  },
  getPublic(zone: ReviewZone): ReviewProviderPublicSettings {
    return getManager(zone).getPublic()
  },
  getSecret(zone: ReviewZone): ProviderSecretSettings {
    return getManager(zone).getSecret()
  },
  update(zone: ReviewZone, input: ReviewProviderSettingsInput): ZoneProviderSettings {
    getManager(zone).update(input)
    return this.getAll()
  }
}
