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
  useSystemProxy: false,
  apiKey: 'secret',
  customHeaders: {},
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
  it('allows Provider custom headers to override default authentication and content type', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [] }))
    await testOpenAiProvider({ ...provider, customHeaders: { Authorization: 'Gateway token', 'Content-Type': 'application/custom+json', 'X-Gateway': 'restx' } }, fetchImpl)
    const request = fetchImpl.mock.calls[0][1]
    const headers = new Headers(request?.headers)
    expect(headers.get('authorization')).toBe('Gateway token')
    expect(headers.get('content-type')).toBe('application/custom+json')
    expect(headers.get('x-gateway')).toBe('restx')
    expect(JSON.parse(String(request?.body)).stream).toBe(false)
  })

  it('网络失败时记录错误类别，且不记录凭据或代理地址', async () => {
    const { events, logger } = captureLogger()
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('connect proxy.local:8080 failed'))

    await expect(testOpenAiProvider(provider, fetchImpl, logger)).rejects.toMatchObject({
      code: 'CONNECTION_FAILED'
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      outcome: 'no_response',
      providerId: 'provider-1',
      model: 'test-model',
      error: { name: 'TypeError' }
    })
    expect(JSON.stringify(events[0])).not.toContain(provider.apiKey)
    expect(JSON.stringify(events[0])).not.toContain('proxy.local')
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
