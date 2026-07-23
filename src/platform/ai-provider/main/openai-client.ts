import type { ResolvedAiProvider } from '../shared/contracts'

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

export async function testOpenAiProvider(
  provider: ResolvedAiProvider,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  let response: Response
  try {
    response = await fetchImpl(`${normalizeAiBaseUrl(provider.baseUrl)}/chat/completions`, {
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
    if ((reason as Error).name === 'TimeoutError' || (reason as Error).name === 'AbortError') {
      throw new AiProviderError('AI 服务连接测试超时。', 'TIMEOUT')
    }
    throw new AiProviderError('无法连接 AI 服务，请检查 Base URL 和网络。', 'CONNECTION_FAILED')
  }
  if (response.status === 401 || response.status === 403) throw new AiProviderError('AI 服务认证失败，请检查 API Key。', 'AUTHENTICATION_FAILED')
  if (response.status === 429) throw new AiProviderError('AI 服务请求过于频繁，请稍后重试。', 'RATE_LIMITED')
  if (!response.ok) throw new AiProviderError(`AI 服务连接测试失败（HTTP ${response.status}）。`, 'REQUEST_FAILED')
  try {
    const value = await response.json() as { choices?: unknown[] }
    if (!Array.isArray(value.choices)) throw new Error('missing choices')
  } catch {
    throw new AiProviderError('AI 服务返回的不是 OpenAI-compatible 响应。', 'INVALID_RESPONSE')
  }
}
