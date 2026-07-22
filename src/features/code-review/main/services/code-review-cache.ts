import { safeStorage } from 'electron'
import Store from 'electron-store'
import type { CodeReviewResult, MergeRequestReviewState } from '../../shared/contracts/code-review'

const TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface ReviewCacheStorage {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface ReviewCacheCrypto {
  isAvailable(): boolean
  encrypt(value: string): string
  decrypt(value: string): string
}

type StoredRecord = { encrypted: string; expiresAt: string }

export class CodeReviewCache {
  private readonly memory = new Map<string, CodeReviewResult>()

  constructor(private readonly storage: ReviewCacheStorage, private readonly crypto: ReviewCacheCrypto, private readonly now: () => Date = () => new Date()) {}

  get(fingerprint: string): CodeReviewResult | null {
    const memory = this.memory.get(fingerprint)
    if (memory && Date.parse(memory.expiresAt) > this.now().getTime()) return memory
    this.memory.delete(fingerprint)
    if (!this.crypto.isAvailable()) return null
    const records = this.records()
    const record = records[fingerprint]
    if (!record || Date.parse(record.expiresAt) <= this.now().getTime()) {
      if (record) { delete records[fingerprint]; this.storage.set('records', records) }
      return null
    }
    try {
      const result = JSON.parse(this.crypto.decrypt(record.encrypted)) as CodeReviewResult
      return result && typeof result === 'object' ? result : null
    } catch { return null }
  }

  set(fingerprint: string, value: Omit<CodeReviewResult, 'expiresAt'> & { expiresAt?: string }): CodeReviewResult {
    const result = { ...value, expiresAt: value.expiresAt ?? new Date(this.now().getTime() + TTL_MS).toISOString() } as CodeReviewResult
    this.memory.set(fingerprint, result)
    if (this.crypto.isAvailable()) {
      const records = this.records()
      records[fingerprint] = { encrypted: this.crypto.encrypt(JSON.stringify(result)), expiresAt: result.expiresAt }
      this.storage.set('records', records)
    }
    return result
  }

  getReviewState(sourceId: string): MergeRequestReviewState {
    if (!sourceId || sourceId.endsWith('@unknown')) return { status: 'unreviewed' }
    const separator = sourceId.lastIndexOf('@')
    if (separator < 0) return { status: 'unreviewed' }
    const sourcePrefix = sourceId.slice(0, separator + 1)
    const related = this.activeResults()
      .filter((result) => result.sourceId.startsWith(sourcePrefix))
      .sort((a, b) => Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt))
    const current = related.find((result) => result.sourceId === sourceId)
    if (current) return {
      status: current.findings.length ? 'issues' : 'passed',
      findingCount: current.findings.length,
      analyzedAt: current.analyzedAt
    }
    return related[0] ? { status: 'stale', analyzedAt: related[0].analyzedAt } : { status: 'unreviewed' }
  }

  clear(): number {
    const count = Math.max(this.memory.size, Object.keys(this.records()).length)
    this.memory.clear()
    this.storage.set('records', {})
    return count
  }

  private records(): Record<string, StoredRecord> {
    const value = this.storage.get('records')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, StoredRecord>
  }

  private activeResults(): CodeReviewResult[] {
    const now = this.now().getTime()
    const results = new Map<string, CodeReviewResult>()
    for (const [fingerprint, result] of this.memory) {
      if (Date.parse(result.expiresAt) <= now) this.memory.delete(fingerprint)
      else results.set(`${result.reviewId}:${result.analyzedAt}`, result)
    }
    if (!this.crypto.isAvailable()) return [...results.values()]
    const records = this.records()
    let changed = false
    for (const [fingerprint, record] of Object.entries(records)) {
      if (Date.parse(record.expiresAt) <= now) {
        delete records[fingerprint]
        changed = true
        continue
      }
      try {
        const result = JSON.parse(this.crypto.decrypt(record.encrypted)) as CodeReviewResult
        if (result && typeof result.sourceId === 'string' && Array.isArray(result.findings)) results.set(`${result.reviewId}:${result.analyzedAt}`, result)
      } catch {
        // Ignore unreadable cache entries without exposing their contents.
      }
    }
    if (changed) this.storage.set('records', records)
    return [...results.values()]
  }
}

let cache: CodeReviewCache | null = null
export function getCodeReviewCache(): CodeReviewCache {
  if (cache) return cache
  const store = new Store<{ records: Record<string, StoredRecord> }>({ name: 'code-review-cache', defaults: { records: {} } })
  const crypto: ReviewCacheCrypto = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
  cache = new CodeReviewCache(store, crypto)
  return cache
}
