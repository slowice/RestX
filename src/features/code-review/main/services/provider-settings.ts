import type { ReviewProviderPublicSettings, ReviewProviderSettingsInput } from '../../shared/contracts/code-review'

const BASE_URL_KEY = 'baseUrl'
const MODEL_KEY = 'model'
const ENCRYPTED_KEY = 'encryptedApiKey'

export interface ProviderSettingsStorage {
  get(key: string): unknown
  set(key: string, value: unknown): void
  delete(key: string): void
}

export interface SecretCrypto {
  isAvailable(): boolean
  encrypt(value: string): string
  decrypt(value: string): string
}

export type ProviderSecretSettings = {
  baseUrl: string
  model: string
  apiKey: string
}

export class ProviderError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ProviderError'
  }
}

export function normalizeBaseUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new ProviderError('Base URL 不是有效的网址。', 'INVALID_SETTINGS')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ProviderError('Base URL 只能使用 HTTP 或 HTTPS。', 'INVALID_SETTINGS')
  if (url.username || url.password) throw new ProviderError('Base URL 不能包含用户名或密码。', 'INVALID_SETTINGS')
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
  return url.toString().replace(/\/$/, '')
}

export class ProviderSettingsManager {
  constructor(
    private readonly storage: ProviderSettingsStorage,
    private readonly crypto: SecretCrypto,
    private readonly defaultBaseUrl: string
  ) {}

  getPublic(): ReviewProviderPublicSettings {
    return {
      provider: 'openai-compatible',
      baseUrl: typeof this.storage.get(BASE_URL_KEY) === 'string' ? this.storage.get(BASE_URL_KEY) as string : this.defaultBaseUrl,
      model: typeof this.storage.get(MODEL_KEY) === 'string' ? this.storage.get(MODEL_KEY) as string : '',
      apiKeyConfigured: typeof this.storage.get(ENCRYPTED_KEY) === 'string'
    }
  }

  update(input: ReviewProviderSettingsInput): ReviewProviderPublicSettings {
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    const model = input.model.trim()
    if (!model || model.length > 300) throw new ProviderError('模型名称不能为空且不能超过 300 个字符。', 'INVALID_SETTINGS')
    if (input.clearApiKey && input.apiKey) throw new ProviderError('不能同时设置和清除 API Key。', 'INVALID_SETTINGS')

    let encrypted: string | undefined
    if (input.apiKey !== undefined) {
      const apiKey = input.apiKey.trim()
      if (!apiKey || apiKey.length > 20_000) throw new ProviderError('API Key 无效。', 'INVALID_SETTINGS')
      if (!this.crypto.isAvailable()) throw new ProviderError('当前系统安全存储不可用，无法安全保存 API Key。', 'SECURE_STORAGE_UNAVAILABLE')
      encrypted = this.crypto.encrypt(apiKey)
    }

    this.storage.set(BASE_URL_KEY, baseUrl)
    this.storage.set(MODEL_KEY, model)
    if (input.clearApiKey) this.storage.delete(ENCRYPTED_KEY)
    if (encrypted) this.storage.set(ENCRYPTED_KEY, encrypted)
    return this.getPublic()
  }

  getSecret(): ProviderSecretSettings {
    const settings = this.getPublic()
    const encrypted = this.storage.get(ENCRYPTED_KEY)
    if (!settings.model || typeof encrypted !== 'string') throw new ProviderError('当前区域的 AI 服务配置不完整，请先设置模型和 API Key。', 'INVALID_SETTINGS')
    if (!this.crypto.isAvailable()) throw new ProviderError('当前系统安全存储不可用，无法读取 API Key。', 'SECURE_STORAGE_UNAVAILABLE')
    try {
      return { baseUrl: settings.baseUrl, model: settings.model, apiKey: this.crypto.decrypt(encrypted) }
    } catch {
      throw new ProviderError('保存的 API Key 无法解密，请重新设置。', 'KEY_DECRYPTION_FAILED')
    }
  }
}
