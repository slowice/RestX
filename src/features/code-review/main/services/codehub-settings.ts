import { safeStorage } from 'electron'
import Store from 'electron-store'
import type { CodeHubPublicSettings, CodeHubSettingsInput } from '../../shared/contracts/code-review'
import { ReviewSourceError } from './code-review-source'
import type { ProviderSettingsStorage, SecretCrypto } from './gitcode-settings'

const ENCRYPTED_PRIVATE_TOKEN_KEY = 'encryptedPrivateToken'

export class CodeHubSettingsManager {
  constructor(private readonly storage: ProviderSettingsStorage, private readonly crypto: SecretCrypto) {}

  getPublic(): CodeHubPublicSettings {
    return { privateTokenConfigured: typeof this.storage.get(ENCRYPTED_PRIVATE_TOKEN_KEY) === 'string' }
  }

  update(input: CodeHubSettingsInput): CodeHubPublicSettings {
    if (input.clearPrivateToken && input.privateToken) throw new ReviewSourceError('不能同时设置和清除 CodeHub PRIVATE-TOKEN。', 'INVALID_SETTINGS')
    if (input.clearPrivateToken) this.storage.delete(ENCRYPTED_PRIVATE_TOKEN_KEY)
    if (input.privateToken !== undefined) {
      const token = input.privateToken.trim()
      if (!token || token.length > 20_000) throw new ReviewSourceError('CodeHub PRIVATE-TOKEN 无效。', 'INVALID_SETTINGS')
      if (!this.crypto.isAvailable()) throw new ReviewSourceError('当前系统安全存储不可用，无法安全保存 CodeHub PRIVATE-TOKEN。', 'SECURE_STORAGE_UNAVAILABLE')
      this.storage.set(ENCRYPTED_PRIVATE_TOKEN_KEY, this.crypto.encrypt(token))
    }
    return this.getPublic()
  }

  getSecret(): string {
    const encrypted = this.storage.get(ENCRYPTED_PRIVATE_TOKEN_KEY)
    if (typeof encrypted !== 'string') return ''
    if (!this.crypto.isAvailable()) throw new ReviewSourceError('当前系统安全存储不可用，无法读取 CodeHub PRIVATE-TOKEN。', 'SECURE_STORAGE_UNAVAILABLE')
    try {
      return this.crypto.decrypt(encrypted)
    } catch {
      throw new ReviewSourceError('保存的 CodeHub PRIVATE-TOKEN 无法解密，请重新设置。', 'KEY_DECRYPTION_FAILED')
    }
  }
}

type CodeHubStoreShape = { encryptedPrivateToken?: string }
let instance: CodeHubSettingsManager | null = null

function getManager(): CodeHubSettingsManager {
  if (instance) return instance
  const store = new Store<CodeHubStoreShape>({ name: 'codehub-settings' })
  const crypto: SecretCrypto = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
  instance = new CodeHubSettingsManager(store, crypto)
  return instance
}

export const codeHubSettings = {
  getPublic: (): CodeHubPublicSettings => getManager().getPublic(),
  update: (input: CodeHubSettingsInput): CodeHubPublicSettings => getManager().update(input),
  getSecret: (): string => getManager().getSecret()
}
