import type { ResolvedAiProvider } from '../shared/contracts'
import {
  aiProviderTestLogger,
  formatProviderTestTimestamp,
  type AiProviderResponseIssue,
  type AiProviderResponseSummary,
  type AiProviderTestLogEvent,
  type AiProviderTestLogger
} from './provider-test-logger'

export type { AiProviderTestLogEvent, AiProviderTestLogger } from './provider-test-logger'

export class AiProviderError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'AiProviderError'
  }
}

export function normalizeAiBaseUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new AiProviderError('Base URL 不是有效的网址。', 'INVALID_SETTINGS')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AiProviderError('Base URL 只能使用 HTTP 或 HTTPS。', 'INVALID_SETTINGS')
  if (url.username || url.password) throw new AiProviderError('Base URL 不能包含用户名或密码。', 'INVALID_SETTINGS')
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
  return url.toString().replace(/\/$/, '')
}

function valueKind(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function summarizeResponseBody(body: string, contentType: string): {
  summary: AiProviderResponseSummary
  value?: unknown
} {
  const receivedBytes = Buffer.byteLength(body, 'utf8')
  if (!body.trim()) {
    return {
      summary: {
        contentType,
        receivedBytes,
        bodyKind: 'empty',
        issue: { path: '$', expected: 'JSON object', actual: 'empty body' }
      }
    }
  }

  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return {
      summary: {
        contentType,
        receivedBytes,
        bodyKind: 'invalid-json',
        issue: { path: '$', expected: 'JSON object', actual: 'invalid JSON' }
      }
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const kind = valueKind(value)
    return {
      value,
      summary: {
        contentType,
        receivedBytes,
        bodyKind: `json-${kind}`,
        issue: { path: '$', expected: 'JSON object', actual: kind }
      }
    }
  }

  const record = value as Record<string, unknown>
  const topLevelKeys = Object.keys(record).sort().slice(0, 50)
  const issue: AiProviderResponseIssue | undefined = Array.isArray(record.choices)
    ? undefined
    : {
        path: '$.choices',
        expected: 'array',
        actual: Object.hasOwn(record, 'choices') ? valueKind(record.choices) : 'missing'
      }
  return {
    value,
    summary: {
      contentType,
      receivedBytes,
      bodyKind: 'json-object',
      topLevelKeys,
      ...(issue ? { issue } : {})
    }
  }
}

async function writeFailureLog(logger: AiProviderTestLogger, event: AiProviderTestLogEvent): Promise<void> {
  await logger.write(event).catch(() => undefined)
}

export async function testOpenAiProvider(
  provider: ResolvedAiProvider,
  fetchImpl: typeof fetch = fetch,
  logger: AiProviderTestLogger = aiProviderTestLogger
): Promise<void> {
  const startedAt = Date.now()
  const endpoint = `${normalizeAiBaseUrl(provider.baseUrl)}/chat/completions`
  let response: Response
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({
        model: provider.modelId,
        temperature: 0,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply with OK.' }]
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000)
    })
  } catch (reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    await writeFailureLog(logger, {
      timestamp: formatProviderTestTimestamp(),
      providerId: provider.id,
      endpoint,
      model: provider.modelId,
      durationMs: Date.now() - startedAt,
      outcome: 'no_response',
      error: {
        name: error.name,
        ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}),
        message: error.message
      }
    })
    if ((reason as Error).name === 'TimeoutError' || (reason as Error).name === 'AbortError') {
      throw new AiProviderError('AI 服务连接测试超时。', 'TIMEOUT')
    }
    throw new AiProviderError('无法连接 AI 服务，请检查 Base URL 和网络。', 'CONNECTION_FAILED')
  }

  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim() || 'unknown'
  let body: string
  try {
    body = await response.text()
  } catch (reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    const summary: AiProviderResponseSummary = {
      contentType,
      receivedBytes: 0,
      bodyKind: 'unreadable',
      issue: { path: '$', expected: 'readable JSON object', actual: `unreadable (${error.name})` }
    }
    await writeFailureLog(logger, {
      timestamp: formatProviderTestTimestamp(),
      providerId: provider.id,
      endpoint,
      model: provider.modelId,
      durationMs: Date.now() - startedAt,
      outcome: 'invalid_response',
      httpStatus: response.status,
      response: summary,
      error: { name: error.name, message: error.message }
    })
    throw new AiProviderError('AI 服务返回的不是 OpenAI-compatible 响应。', 'INVALID_RESPONSE')
  }

  const { summary, value } = summarizeResponseBody(body, contentType)
  if (!response.ok) {
    await writeFailureLog(logger, {
      timestamp: formatProviderTestTimestamp(),
      providerId: provider.id,
      endpoint,
      model: provider.modelId,
      durationMs: Date.now() - startedAt,
      outcome: 'http_error',
      httpStatus: response.status,
      response: summary
    })
    if (response.status === 401 || response.status === 403) throw new AiProviderError('AI 服务认证失败，请检查 API Key。', 'AUTHENTICATION_FAILED')
    if (response.status === 429) throw new AiProviderError('AI 服务请求过于频繁，请稍后重试。', 'RATE_LIMITED')
    throw new AiProviderError(`AI 服务连接测试失败（HTTP ${response.status}）。`, 'REQUEST_FAILED')
  }

  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as Record<string, unknown>).choices)) {
    await writeFailureLog(logger, {
      timestamp: formatProviderTestTimestamp(),
      providerId: provider.id,
      endpoint,
      model: provider.modelId,
      durationMs: Date.now() - startedAt,
      outcome: 'invalid_response',
      httpStatus: response.status,
      response: summary
    })
    throw new AiProviderError('AI 服务返回的不是 OpenAI-compatible 响应。', 'INVALID_RESPONSE')
  }
}
