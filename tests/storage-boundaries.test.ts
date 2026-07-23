import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const sourceRoot = new URL('../src/', import.meta.url)

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, sourceRoot), 'utf8')
}

describe('RestX storage boundaries', () => {
  it('loads application features only after storage migration', async () => {
    const main = await source('main/index.ts')
    expect(main).not.toMatch(/^import .*register-platform/m)
    expect(main.indexOf('await initializeRestxStorage')).toBeLessThan(main.indexOf("await import('../platform/main/register-platform')"))
    expect(main).toContain("app.setPath('userData', storageLayout.runtime)")
  })

  it('routes each persistent store to config or cache explicitly', async () => {
    const configWriters = await Promise.all([
      'features/ai-inspector/main/services/preferences.ts',
      'platform/ai-provider/main/provider-registry.ts',
      'features/code-review/main/services/gitcode-settings.ts',
      'features/code-review/main/services/codehub-settings.ts'
    ].map(source))
    const cacheWriters = await Promise.all([
      'features/ai-inspector/main/services/analysis-cache.ts',
      'features/code-review/main/services/code-review-cache.ts'
    ].map(source))

    for (const writer of configWriters) expect(writer).toContain('getRestxStorageLayout().config')
    for (const writer of cacheWriters) expect(writer).toContain('getRestxStorageLayout().cache')
  })

  it('does not create new mixed-case RestX application paths outside migration code', async () => {
    const writers = await Promise.all([
      'features/ai-inspector/main/services/ai-call-logger.ts',
      'features/ai-inspector/main/services/user-preset-store.ts',
      'features/code-review/main/services/review-audit-logger.ts',
      'features/ai-inspector/renderer/components/SmartImportDialog.tsx'
    ].map(source))
    for (const writer of writers) expect(writer).not.toContain('.RestX')
  })
})
