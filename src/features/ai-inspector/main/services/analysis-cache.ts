import { createHash } from 'node:crypto'
import Store from 'electron-store'
import { getRestxStorageLayout } from '../../../../platform/main/storage'
import type { AiAnalysisRecord, CachedAnalysisResponse } from '../../shared/contracts/ai-capability'
import { normalizeBaseUrl } from './openai-provider'

type CacheEntries = Record<string, AiAnalysisRecord>

export interface AnalysisCacheStorage {
  read(): unknown
  write(value: unknown): void
}

function pathIdentity(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex')
}

function isRecord(value: unknown): value is AiAnalysisRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.sourceHash === 'string' && typeof record.analysisFingerprint === 'string' &&
    typeof record.model === 'string' && typeof record.analyzedAt === 'string' &&
    typeof record.result === 'object' && record.result !== null
}

export function createAnalysisFingerprint(input: {
  sourceHash: string
  baseUrl: string
  model: string
  providerId?: string
  promptVersion: string
}): string {
  return createHash('sha256').update(JSON.stringify({
    sourceHash: input.sourceHash,
    provider: 'openai-compatible',
    providerId: input.providerId ?? null,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model.trim(),
    promptVersion: input.promptVersion
  })).digest('hex')
}

export class AnalysisCache {
  constructor(private readonly storage: AnalysisCacheStorage) {}

  private entries(): CacheEntries {
    const value = this.storage.read()
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, AiAnalysisRecord] => isRecord(entry[1])))
  }

  get(filePath: string, sourceHash: string, analysisFingerprint: string): CachedAnalysisResponse {
    const record = this.entries()[pathIdentity(filePath)]
    if (!record) return { status: 'none', record: null }
    if (record.sourceHash !== sourceHash || record.analysisFingerprint !== analysisFingerprint) return { status: 'stale', record: null }
    return { status: 'valid', record }
  }

  set(filePath: string, record: AiAnalysisRecord): void {
    const entries = this.entries()
    entries[pathIdentity(filePath)] = record
    this.storage.write(entries)
  }

  clear(): number {
    const count = Object.keys(this.entries()).length
    this.storage.write({})
    return count
  }
}

let persistentCache: AnalysisCache | null = null

export function getPersistentAnalysisCache(): AnalysisCache {
  if (persistentCache) return persistentCache
  const store = new Store<{ entries: CacheEntries }>({ name: 'analysis-cache', cwd: getRestxStorageLayout().cache, defaults: { entries: {} } })
  persistentCache = new AnalysisCache({
    read: () => store.get('entries'),
    write: (value) => store.set('entries', value as CacheEntries)
  })
  return persistentCache
}
