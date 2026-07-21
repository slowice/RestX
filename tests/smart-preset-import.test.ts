import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AiCallLogEvent } from '../src/main/services/ai-call-logger'
import { generateSmartPresetDraft, SMART_PRESET_SYSTEM_PROMPT } from '../src/main/services/smart-preset-import'

const temporaryDirectories: string[] = []
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))))

const modelDraft = {
  preset: {
    id: 'nova', displayName: 'Nova', version: 1,
    probes: [{ relativePath: '.nova', entryType: 'directory' }],
    sources: [{
      id: 'nova-home', relativePath: '.nova', label: '.nova', maxDepth: 2,
      patterns: [
        { glob: 'config.json', kind: 'config', viewer: 'config', label: 'Nova 配置' },
        { glob: 'logs/**/*.log', kind: 'log', viewer: 'metadata', label: 'Nova 日志' }
      ],
      excludes: ['auth.json', '**/*.db', 'cache/**']
    }]
  },
  explanation: '根据 .nova 目录和文件名生成。',
  warnings: []
}

describe('smart preset generation', () => {
  it('uses a strict prompt, logs the call, validates output, and trial-scans it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'restx-smart-import-'))
    temporaryDirectories.push(root)
    await mkdir(path.join(root, '.nova', 'logs'), { recursive: true })
    await writeFile(path.join(root, '.nova', 'config.json'), 'SECRET_FILE_BODY')
    await writeFile(path.join(root, '.nova', 'logs', 'run.log'), 'private')
    const events: AiCallLogEvent[] = []
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelDraft) } }] }), { status: 200 }))

    const result = await generateSmartPresetDraft({ toolName: 'Nova', rootPath: root, knownPaths: '.nova', notes: '', metadataConsent: true }, {
      settings: { baseUrl: 'https://example.com/v1', model: 'demo', apiKey: 'top-secret' }, fetchImpl,
      logger: { write: async (event) => { events.push(event) } }
    })

    expect(result.trial.detected).toBe(true)
    expect(result.trial.candidates.map((item) => item.name)).toEqual(['config.json', 'run.log'])
    const requestBody = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(requestBody.messages[0].content).toBe(SMART_PRESET_SYSTEM_PROMPT)
    expect(JSON.stringify(requestBody)).not.toContain('SECRET_FILE_BODY')
    expect(JSON.stringify(requestBody)).not.toContain('top-secret')
    expect(events.map((event) => event.phase)).toEqual(['request', 'response'])
  })

  it('rejects unsafe model paths and never returns a persistable draft', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'restx-smart-import-'))
    temporaryDirectories.push(root)
    const unsafe = { ...modelDraft, preset: { ...modelDraft.preset, sources: [{ ...modelDraft.preset.sources[0], relativePath: '/etc' }] } }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(unsafe) } }] }), { status: 200 }))

    await expect(generateSmartPresetDraft({ toolName: 'Nova', rootPath: root, knownPaths: '', notes: '', metadataConsent: true }, {
      settings: { baseUrl: 'https://example.com/v1', model: 'demo', apiKey: 'key' }, fetchImpl,
      logger: { write: async () => undefined }
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('requires explicit metadata consent before inventory or model access', async () => {
    await expect(generateSmartPresetDraft({ toolName: 'Nova', rootPath: '/tmp', knownPaths: '', notes: '', metadataConsent: false }, {
      settings: { baseUrl: 'https://example.com/v1', model: 'demo', apiKey: 'key' }, fetchImpl: vi.fn()
    })).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' })
  })
})
