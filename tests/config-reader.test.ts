import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseConfigText, readConfigDocument, redactConfigValue } from '../src/main/services/config-reader'

const temporaryDirectories: string[] = []

async function makeFixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'restx-config-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('parseConfigText', () => {
  it.each([
    ['config.json', '{"model":"gpt","nested":{"enabled":true}}', { model: 'gpt', nested: { enabled: true } }],
    ['config.yaml', 'model: gpt\nnested:\n  enabled: true', { model: 'gpt', nested: { enabled: true } }],
    ['config.toml', 'model = "gpt"\n[nested]\nenabled = true', { model: 'gpt', nested: { enabled: true } }],
    ['settings.ini', 'model=gpt\n[nested]\nenabled=true', { model: 'gpt', nested: { enabled: 'true' } }],
    ['.env', 'MODEL=gpt\nENABLED=true', { MODEL: 'gpt', ENABLED: 'true' }]
  ])('parses %s as inert structured data', (fileName, input, expected) => {
    const result = parseConfigText(fileName, input)
    expect(result.data).toEqual(expected)
    expect(result.parseError).toBeNull()
  })

  it('returns text and a diagnostic for invalid structured syntax', () => {
    const result = parseConfigText('config.json', '{ broken')
    expect(result.data).toBeNull()
    expect(result.redactedText).toBe('{ broken')
    expect(result.parseError).toContain('JSON')
  })

  it('still redacts inline secrets when structured parsing fails', () => {
    const result = parseConfigText('config.json', '{"apiKey":"raw-secret", broken}')
    expect(result.data).toBeNull()
    expect(result.redactedText).not.toContain('raw-secret')
    expect(result.redactedText).toContain('[REDACTED]')
  })
})

describe('redaction', () => {
  it('redacts nested sensitive keys while preserving ordinary values', () => {
    const result = redactConfigValue({
      model: 'gpt-4.1-mini',
      apiKey: 'sk-secret',
      nested: { client_secret: 'hidden', timeout: 30 },
      tokens: [{ accessToken: 'abc' }]
    })
    expect(result.value).toEqual({
      model: 'gpt-4.1-mini',
      apiKey: '[REDACTED]',
      nested: { client_secret: '[REDACTED]', timeout: 30 },
      tokens: [{ accessToken: '[REDACTED]' }]
    })
    expect(result.count).toBe(3)
  })

  it('redacts key-value secrets and bearer credentials in text', () => {
    const result = parseConfigText('.env', 'API_KEY=sk-live-secret\nMODEL=gpt\nAUTHORIZATION=Bearer top-secret')
    expect(result.redactedText).not.toContain('sk-live-secret')
    expect(result.redactedText).not.toContain('top-secret')
    expect(result.redactedText).toContain('MODEL=gpt')
    expect(result.redactionCount).toBeGreaterThanOrEqual(2)
  })
})

describe('readConfigDocument', () => {
  it('returns metadata, a stable source hash and no raw secret', async () => {
    const root = await makeFixture()
    const file = path.join(root, 'config.json')
    await writeFile(file, '{"apiKey":"secret","model":"gpt"}')
    const document = await readConfigDocument(file)
    expect(document.sourceHash).toMatch(/^[a-f0-9]{64}$/)
    expect(document.redactedText).not.toContain('secret')
    expect(document.data).toEqual({ apiKey: '[REDACTED]', model: 'gpt' })
  })

  it('rejects files over the viewing limit', async () => {
    const root = await makeFixture()
    const file = path.join(root, 'large.json')
    await writeFile(file, 'x'.repeat(101))
    await expect(readConfigDocument(file, { maxBytes: 100 })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  })

  it('rejects symbolic links', async () => {
    const root = await makeFixture()
    const target = path.join(root, 'target.json')
    const link = path.join(root, 'link.json')
    await writeFile(target, '{}')
    const { symlink } = await import('node:fs/promises')
    await symlink(target, link)
    await expect(readConfigDocument(link)).rejects.toMatchObject({ code: 'SYMLINK_NOT_ALLOWED' })
  })
})
