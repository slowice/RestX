import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('mail-template main handoff boundary', () => {
  it('routes drafts to classic Outlook without a system protocol-handler fallback', async () => {
    const source = await readFile(new URL('../src/features/mail-template/main/register.ts', import.meta.url), 'utf8')
    expect(source).toContain('openWithClassicOutlook(buildMailtoUri(draft))')
    expect(source).not.toContain('shell.openExternal')
    expect(source).not.toContain('execFile')
  })
})
