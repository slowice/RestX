import { safeStorage } from 'electron'
import Store from 'electron-store'
import type { GitCodePublicSettings, GitCodeSettingsInput } from '../../shared/contracts/code-review'
import type { ProviderSettingsStorage, SecretCrypto } from './provider-settings'
import { GITCODE_API_BASE_URL } from './gitcode-adapter'
import { ReviewSourceError } from './code-review-source'

const ENCRYPTED_TOKEN_KEY = 'encryptedAccessToken'

export class GitCodeSettingsManager {
  constructor(private readonly storage: ProviderSettingsStorage, private readonly crypto: SecretCrypto) {}

  getPublic(): GitCodePublicSettings {
    return { apiBaseUrl: GITCODE_API_BASE_URL, accessTokenConfigured: typeof this.storage.get(ENCRYPTED_TOKEN_KEY) === 'string' }
  }

  update(input: GitCodeSettingsInput): GitCodePublicSettings {
    if (input.clearAccessToken && input.accessToken) throw new ReviewSourceError('不能同时设置和清除 GitCode PAT。', 'INVALID_SETTINGS')
    if (input.clearAccessToken) this.storage.delete(ENCRYPTED_TOKEN_KEY)
    if (input.accessToken !== undefined) {
      const token = input.accessToken.trim()
      if (!token || token.length > 20_000) throw new ReviewSourceError('GitCode PAT 无效。', 'INVALID_SETTINGS')
      if (!this.crypto.isAvailable()) throw new ReviewSourceError('当前系统安全存储不可用，无法安全保存 GitCode PAT。', 'SECURE_STORAGE_UNAVAILABLE')
      this.storage.set(ENCRYPTED_TOKEN_KEY, this.crypto.encrypt(token))
    }
    return this.getPublic()
  }

  getSecret(): string {
    const encrypted = this.storage.get(ENCRYPTED_TOKEN_KEY)
    if (typeof encrypted !== 'string') return ''
    if (!this.crypto.isAvailable()) throw new ReviewSourceError('当前系统安全存储不可用，无法读取 GitCode PAT。', 'SECURE_STORAGE_UNAVAILABLE')
    try {
      return this.crypto.decrypt(encrypted)
    } catch {
      throw new ReviewSourceError('保存的 GitCode PAT 无法解密，请重新设置。', 'KEY_DECRYPTION_FAILED')
    }
  }
}

type GitCodeStoreShape = { encryptedAccessToken?: string }
let instance: GitCodeSettingsManager | null = null

function getManager(): GitCodeSettingsManager {
  if (instance) return instance
  const store = new Store<GitCodeStoreShape>({ name: 'gitcode-settings' })
  const crypto: SecretCrypto = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
  instance = new GitCodeSettingsManager(store, crypto)
  return instance
}

export const gitCodeSettings = {
  getPublic: (): GitCodePublicSettings => getManager().getPublic(),
  update: (input: GitCodeSettingsInput): GitCodePublicSettings => getManager().update(input),
  getSecret: (): string => getManager().getSecret()
}
