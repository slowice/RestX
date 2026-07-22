import { describe, expect, it, vi } from 'vitest'
import type { ConfigDocument } from '../src/features/ai-inspector/shared/contracts/config'
import type { AiCallLogEvent } from '../src/features/ai-inspector/main/services/ai-call-logger'
import { analyzeWithOpenAiCompatible, normalizeBaseUrl, parseAnalysisResponse, ProviderError } from '../src/features/ai-inspector/main/services/openai-provider'

const document: ConfigDocument = {
  path: '/authorized/config.json',
  name: 'config.json',
  format: 'json',
  sizeBytes: 42,
  modifiedAt: '2026-07-21T00:00:00.000Z',
  sourceHash: 'a'.repeat(64),
  redactedText: '{\n  "apiKey": "[REDACTED]",\n  "model": "gpt"\n}',
  data: { apiKey: '[REDACTED]', model: 'gpt' },
  parseError: null,
  redactionCount: 1
}

const validAnalysis = {
  summary: '这是一个模型配置。',
  detectedTool: 'Example',
  sections: [{ title: '基础设置', items: [{ key: 'model', explanation: '模型名称', status: 'ok' }] }],
  risks: [{ severity: 'info', title: '已脱敏', description: '密钥未发送' }],
  recommendations: ['保持密钥轮换']
}

describe('normalizeBaseUrl', () => {
  it('normalizes a valid HTTP URL and removes a chat endpoint suffix', () => {
    expect(normalizeBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1')
    expect(normalizeBaseUrl('http://localhost:11434/v1/chat/completions')).toBe('http://localhost:11434/v1')
  })

  it('rejects unsupported protocols and embedded credentials', () => {
    expect(() => normalizeBaseUrl('file:///tmp/model')).toThrow(ProviderError)
    expect(() => normalizeBaseUrl('https://user:pass@example.com/v1')).toThrow(ProviderError)
  })
})

describe('analyzeWithOpenAiCompatible', () => {
  it('builds a minimal compatible request and validates the structured result', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(validAnalysis)}\n\`\`\`` } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const events: AiCallLogEvent[] = []

    const result = await analyzeWithOpenAiCompatible({
      settings: { baseUrl: 'https://example.com/v1', model: 'demo-model', apiKey: 'top-secret' },
      document,
      fetchImpl,
      logger: { write: async (event) => { events.push(event) } }
    })

    expect(result).toEqual(validAnalysis)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, request] = (fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>)[0]
    expect(url).toBe('https://example.com/v1/chat/completions')
    expect(request.headers).toMatchObject({ Authorization: 'Bearer top-secret' })
    const body = JSON.parse(String(request.body))
    expect(body.model).toBe('demo-model')
    expect(JSON.stringify(body)).not.toContain('top-secret')
    expect(JSON.stringify(body)).not.toContain('/authorized/config.json')
    expect(JSON.stringify(body)).toContain('[REDACTED]')
    expect(events.map((event) => event.phase)).toEqual(['request', 'response', 'parse'])
    expect(events[2].payload).toMatchObject({ status: 'success', sections: 1, risks: 1, recommendations: 1 })
    expect(JSON.stringify(events)).not.toContain('top-secret')
    expect(JSON.stringify(events)).toContain('这是一个模型配置')
  })

  it('maps authentication failures without exposing provider response content', async () => {
    const fetchImpl = vi.fn(async () => new Response('credential top-secret rejected', { status: 401 }))
    const promise = analyzeWithOpenAiCompatible({
      settings: { baseUrl: 'https://example.com/v1', model: 'demo-model', apiKey: 'top-secret' },
      document,
      fetchImpl
    })
    await expect(promise).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' })
    await expect(promise).rejects.not.toThrow(/top-secret/)
  })

  it('rejects invalid model output instead of caching it', async () => {
    const events: AiCallLogEvent[] = []
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"summary": 3}' } }] }), { status: 200 }))
    await expect(analyzeWithOpenAiCompatible({
      settings: { baseUrl: 'https://example.com/v1', model: 'demo-model', apiKey: 'key' },
      document, fetchImpl, logger: { write: async (event) => { events.push(event) } }
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(events.map((event) => event.phase)).toEqual(['request', 'response', 'parse'])
    expect(events[2]).toMatchObject({ payload: { status: 'failed' }, error: { code: 'INVALID_RESPONSE' } })
  })

  it('normalizes common compatible-provider field aliases before displaying the result', () => {
    const result = parseAnalysisResponse(JSON.stringify({
      summary: '智谱返回的配置说明。',
      detectedTool: 'RestX',
      sections: [{ name: '模型设置', items: [{ name: 'model', value: '用于选择模型', status: 'ok' }] }],
      risks: [{ severity: 'warning', description: '建议限制配置文件权限' }],
      recommendations: [{ priority: 'high', description: '定期轮换密钥' }]
    }))

    expect(result.sections).toEqual([{ title: '模型设置', items: [{ key: 'model', explanation: '用于选择模型', status: 'ok' }] }])
    expect(result.risks).toEqual([{ severity: 'warning', title: '注意事项', description: '建议限制配置文件权限' }])
    expect(result.recommendations).toEqual(['定期轮换密钥'])
  })

  it('recovers JSON surrounded by thinking text and normalizes common Claude-analysis variations', () => {
    const content = `<think>我需要先分析配置</think>\n以下是结果：\n\`\`\`json\n${JSON.stringify({
      overview: 'Claude Code 配置摘要。',
      tool: 'Claude Code',
      sections: {
        '模型配置': [{ path: 'env.ANTHROPIC_MODEL', description: '主模型', status: 'normal' }]
      },
      warnings: [{ level: 'medium', name: '环境变量', message: '建议确认变量来源', field: 'env' }],
      suggestions: [{ text: '定期检查模型配置' }]
    })}\n\`\`\`\n完成。`

    const result = parseAnalysisResponse(content)

    expect(result).toEqual({
      summary: 'Claude Code 配置摘要。', detectedTool: 'Claude Code',
      sections: [{ title: '模型配置', items: [{ key: 'env.ANTHROPIC_MODEL', explanation: '主模型', status: 'ok' }] }],
      risks: [{ severity: 'warning', title: '环境变量', description: '建议确认变量来源', path: 'env' }],
      recommendations: ['定期检查模型配置']
    })
  })

  it('accepts double-encoded JSON, optional collections, and array-form message content', async () => {
    const minimal = { summary: '配置可用。' }
    expect(parseAnalysisResponse(JSON.stringify(JSON.stringify(minimal)))).toEqual({
      summary: '配置可用。', detectedTool: null, sections: [], risks: [], recommendations: []
    })

    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: [{ type: 'text', text: JSON.stringify(validAnalysis) }] } }]
    }), { status: 200 }))
    const result = await analyzeWithOpenAiCompatible({
      settings: { baseUrl: 'https://example.com/v1', model: 'demo-model', apiKey: 'key' }, document, fetchImpl
    })
    expect(result.summary).toBe(validAnalysis.summary)
  })
})
