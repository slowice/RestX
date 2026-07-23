import { describe, expect, it, vi } from 'vitest'

vi.mock('node:os', async (importOriginal) => ({ ...await importOriginal<typeof import('node:os')>(), homedir: () => '/Users/demo' }))

import { formatLogTimestamp, getAiLogDirectory } from '../src/features/ai-inspector/main/services/ai-call-logger'

describe('AI call logger', () => {
  it('uses the hidden RestX log directory in the user home', () => {
    expect(getAiLogDirectory()).toBe('/Users/demo/.restx/logs')
  })

  it('formats timestamps with the local timezone offset instead of UTC', () => {
    expect(formatLogTimestamp(new Date('2026-07-21T07:45:43.187Z'), -480))
      .toBe('2026-07-21T15:45:43.187+08:00')
  })
})
