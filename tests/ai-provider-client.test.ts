import { describe, expect, it, vi } from 'vitest'
import type { ResolvedAiProvider } from '../src/platform/ai-provider/shared/contracts'
import {
  testOpenAiProvider,
  type AiProviderTestLogEvent,
  type AiProviderTestLogger
} from '../src/platform/ai-provider/main/openai-client'

const provider: ResolvedAiProvider = {
  id: 'provider-1',
  name: '测试 Provider',
  source: 'manual',
  baseUrl: 'https://example.com/v1',
  modelId: 'test-model',
  apiKey: 'secret',
  identityFingerprint: 'identity-fingerprint',
  credentialFingerprint: 'credential-fingerprint'
}

function captureLogger(): { events: AiProviderTestLogEvent[]; logger: AiProviderTestLogger } {
  const events: AiProviderTestLogEvent[] = []
  return {
    events,
    logger: { write: async (event) => { events.push(event) } }
  }
}

describe('AI Provider 连接测试日志', () => {
  it('网络失败时记录未收到模型响应，且不记录凭据', async () => {
    const { events, logger } = captureLogger()
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'))

    await expect(testOpenAiProvider(provider, fetchImpl, logger)).rejects.toMatchObject({
      code: 'CONNECTION_FAILED'
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      outcome: 'no_response',
      providerId: 'provider-1',
      model: 'test-model',
      error: { name: 'TypeError', message: 'fetch failed' }
    })
    expect(JSON.stringify(events[0])).not.toContain(provider.apiKey)
  })

  it('收到非 JSON 响应时记录实际结构和错误位置', async () => {
    const { events, logger } = captureLogger()
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>bad gateway</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    }))

    await expect(testOpenAiProvider(provider, fetchImpl, logger)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      outcome: 'invalid_response',
      httpStatus: 200,
      response: {
        contentType: 'text/html',
        bodyKind: 'invalid-json',
        issue: {
          path: '$',
          expected: 'JSON object',
          actual: 'invalid JSON'
        }
      }
    })
    expect(JSON.stringify(events[0])).not.toContain('bad gateway')
  })

  it('choices 不是数组时记录字段类型和 JSON 顶层键', async () => {
    const { events, logger } = captureLogger()
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      id: 'response-id',
      choices: { message: 'unexpected' },
      usage: { total_tokens: 1 }
    }))

    await expect(testOpenAiProvider(provider, fetchImpl, logger)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      outcome: 'invalid_response',
      response: {
        bodyKind: 'json-object',
        topLevelKeys: ['choices', 'id', 'usage'],
        issue: {
          path: '$.choices',
          expected: 'array',
          actual: 'object'
        }
      }
    })
    expect(JSON.stringify(events[0])).not.toContain('unexpected')
  })
})
