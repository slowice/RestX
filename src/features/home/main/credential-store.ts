import { safeStorage } from 'electron'
import Store from 'electron-store'
import { chmodSync } from 'node:fs'
import type { HomeLoginInput } from '../shared/contracts'
import { HomeError } from './home-error'
import { getHomeConfigRoot } from './storage-root'

type HomeCredentialShape = {
  version: 1
  account: string
  encryptedPassword: string
}

export interface HomeSecretCrypto {
  isAvailable(): boolean
  encrypt(value: string): string
}

export interface HomeCredentialStorage {
  get<Key extends keyof HomeCredentialShape>(key: Key, defaultValue: HomeCredentialShape[Key]): HomeCredentialShape[Key]
  set(value: HomeCredentialShape): void
}

export class HomeCredentialStore {
  constructor(
    private readonly storage: HomeCredentialStorage,
    private readonly crypto: HomeSecretCrypto,
    private readonly protectFile: () => void = () => undefined
  ) {}

  getAccount(): string {
    const account = this.storage.get('account', '')
    return typeof account === 'string' ? account : ''
  }

  save(input: HomeLoginInput): void {
    if (!this.crypto.isAvailable()) {
      throw new HomeError('SECURE_STORAGE_UNAVAILABLE', '当前系统安全存储不可用，无法保存密码。')
    }
    try {
      this.storage.set({ version: 1, account: input.account, encryptedPassword: this.crypto.encrypt(input.password) })
      this.protectFile()
    } catch {
      throw new HomeError('CREDENTIAL_SAVE_FAILED', '账号密码保存失败，请重试。')
    }
  }
}

export function createHomeCredentialStore(): HomeCredentialStore {
  const store = new Store<HomeCredentialShape>({
    name: 'home-login',
    cwd: getHomeConfigRoot(),
    defaults: { version: 1, account: '', encryptedPassword: '' }
  })
  const protectFile = (): void => chmodSync(store.path, 0o600)
  try { protectFile() } catch { /* The first successful save creates and protects the file. */ }
  return new HomeCredentialStore(store, {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString('base64')
  }, protectFile)
}
