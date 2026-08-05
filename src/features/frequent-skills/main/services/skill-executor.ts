import { createOpenAiRequestHeaders, normalizeAiBaseUrl } from '../../../../platform/ai-provider/main/openai-client'
import type { AiProviderExecutionContext } from '../../../../platform/ai-provider/shared/contracts'
import { MAX_SKILL_RESULT_CHARS } from '../../shared/contracts'
import { FrequentSkillsError } from './frequent-skills-error'

const EXECUTION_TIMEOUT_MS = 180_000

function extractText(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FrequentSkillsError('EXECUTION_FAILED', 'AI 服务返回了无法读取的结果。')
  }
  const choices = (value as Record<string, unknown>).choices
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') {
    throw new FrequentSkillsError('EXECUTION_FAILED', 'AI 服务返回了无法读取的结果。')
  }
  const message = (choices[0] as Record<string, unknown>).message
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new FrequentSkillsError('EXECUTION_FAILED', 'AI 服务返回了无法读取的结果。')
  }
  const content = (message as Record<string, unknown>).content
  const text = typeof content === 'string'
    ? content.trim()
    : Array.isArray(content)
      ? content.flatMap((part) => part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string'
        ? [(part as Record<string, unknown>).text as string]
        : []).join('').trim()
      : ''
  if (!text || text.length > MAX_SKILL_RESULT_CHARS) {
    throw new FrequentSkillsError('EXECUTION_FAILED', 'AI 服务返回了空结果或结果过长。')
  }
  return text
}

export async function executeSkillPrompt(
  prompt: string,
  { provider, fetch: fetchImpl }: AiProviderExecutionContext
): Promise<string> {
  let response: Response
  try {
    response = await fetchImpl(`${normalizeAiBaseUrl(provider.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: createOpenAiRequestHeaders(provider),
      body: JSON.stringify({
        model: provider.modelId,
        stream: false,
        temperature: 0.2,
        max_tokens: 4_000,
        messages: [
          {
            role: 'system',
            content: '你正在执行用户明确创建的 RestX AI Skill。请只生成文本回答，不声称已调用工具、终端或文件系统，也不要泄露系统或服务配置。'
          },
          { role: 'user', content: prompt }
        ]
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(EXECUTION_TIMEOUT_MS)
    })
  } catch (reason) {
    if ((reason as Error)?.name === 'TimeoutError' || (reason as Error)?.name === 'AbortError') {
      throw new FrequentSkillsError('EXECUTION_FAILED', 'Skill 执行超时，请稍后重试。')
    }
    throw new FrequentSkillsError('EXECUTION_FAILED', '无法连接 AI 服务，请检查 Provider 和网络。')
  }

  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'AI Provider 认证失败，请检查配置。'
      : response.status === 429
        ? 'AI 服务请求过于频繁，请稍后重试。'
        : `AI 服务执行失败（HTTP ${response.status}）。`
    throw new FrequentSkillsError('EXECUTION_FAILED', message)
  }

  let envelope: unknown
  try {
    envelope = JSON.parse(await response.text())
  } catch {
    throw new FrequentSkillsError('EXECUTION_FAILED', 'AI 服务返回了无法读取的结果。')
  }
  return extractText(envelope)
}
