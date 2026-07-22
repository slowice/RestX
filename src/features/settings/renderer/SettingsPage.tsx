import { useEffect, useState, type FormEvent } from 'react'
import { Bot, Check, Database, FolderCheck, KeyRound, Server, ShieldCheck, Trash2 } from 'lucide-react'
import type { AiProviderPublicSettings, RuntimeStatus } from '../../ai-inspector/shared/contracts/ai-capability'
import { useInspectorState } from '../../ai-inspector/renderer'
import { PageHeader } from '../../../platform/renderer/components/PageHeader'
import './settings.css'

const statusLabels: Record<RuntimeStatus, string> = { stopped: '待配置', starting: '启动中', ready: '已就绪', error: '异常' }

export function SettingsPage(): React.JSX.Element {
  const { preferences, clearHistory, setAiConsent } = useInspectorState()
  const [runtime, setRuntime] = useState<RuntimeStatus>('stopped')
  const [provider, setProvider] = useState<AiProviderPublicSettings | null>(null)
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const refreshAiSettings = async (): Promise<void> => {
    const [nextRuntime, nextProvider] = await Promise.all([window.restx.ai.getRuntimeStatus(), window.restx.ai.getProviderSettings()])
    setRuntime(nextRuntime)
    setProvider(nextProvider)
    setBaseUrl(nextProvider.baseUrl)
    setModel(nextProvider.model)
  }

  useEffect(() => {
    void refreshAiSettings().catch((reason) => setNotice({ kind: 'error', text: errorMessage(reason) }))
  }, [])

  const saveProvider = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const next = await window.restx.ai.updateProviderSettings({ baseUrl, model, ...(apiKey.trim() ? { apiKey } : {}) })
      setProvider(next)
      setApiKey('')
      setRuntime(await window.restx.ai.getRuntimeStatus())
      setNotice({ kind: 'success', text: 'AI 服务配置已安全保存。' })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setSaving(false)
    }
  }

  const removeKey = async (): Promise<void> => {
    setSaving(true)
    try {
      const next = await window.restx.ai.updateProviderSettings({ baseUrl, model, clearApiKey: true })
      setProvider(next)
      setRuntime('stopped')
      setNotice({ kind: 'success', text: 'API Key 已从安全存储中移除。' })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setSaving(false)
    }
  }

  const clearCache = async (): Promise<void> => {
    if (!window.confirm('清除所有 AI 配置解析缓存？这不会删除配置文件或 AI 服务设置。')) return
    try {
      const result = await window.restx.ai.clearAnalysisCache()
      setNotice({ kind: 'success', text: `已清除 ${result.cleared} 条 AI 解析缓存。` })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    }
  }

  return (
    <div className="page settings-page">
      <PageHeader eyebrow="PREFERENCES" title="设置" description="管理 RestX 的本地数据、AI 服务和内容授权。" />
      {notice && <div className={`settings-notice ${notice.kind}`}>{notice.kind === 'success' ? <Check size={15} /> : <ShieldCheck size={15} />}{notice.text}</div>}

      <section className="settings-section">
        <div className="settings-title"><FolderCheck size={19} /><div><h2>已授权目录</h2><p>RestX 只能访问你通过系统选择器主动授权的目录。</p></div></div>
        <div className="setting-row"><div><strong>最近使用的目录</strong><span className="path-value">{preferences?.recentDirectory ?? '暂无授权目录'}</span></div><button className="button danger" disabled={!preferences?.recentDirectory} onClick={() => void clearHistory()}><Trash2 size={15} />清除记录</button></div>
      </section>

      <section className="settings-section provider-section">
        <div className="settings-title"><Bot size={19} /><div><h2>AI 服务</h2><p>支持 OpenAI-compatible 接口，所有请求都由 Electron 主进程发起。</p></div><span className={`runtime-badge ${runtime}`}><i />{statusLabels[runtime]}</span></div>
        <form className="provider-form" onSubmit={(event) => void saveProvider(event)}>
          <label><span><Server size={14} />Base URL</span><input type="url" required value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /><small>RestX 将调用该地址下的 `/chat/completions`。</small></label>
          <label><span><Bot size={14} />模型</span><input required value={model} onChange={(event) => setModel(event.target.value)} placeholder="例如 gpt-4.1-mini 或本地模型名" /></label>
          <label><span><KeyRound size={14} />API Key</span><input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={provider?.apiKeyConfigured ? '已安全保存；留空表示不修改' : '输入 API Key'} /><small>使用系统安全存储加密，页面无法读取已保存的密钥。</small></label>
          <div className="provider-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? '保存中…' : '保存 AI 服务'}</button>{provider?.apiKeyConfigured && <button className="button danger" type="button" disabled={saving} onClick={() => void removeKey()}>移除 API Key</button>}</div>
        </form>
        <label className="setting-row switch-row"><div><strong>允许 AI 分析本地配置</strong><span>仅在你手动点击解析时，发送经过脱敏的配置数据。默认关闭。</span></div><button type="button" role="switch" aria-checked={preferences?.aiLocalAnalysisEnabled ?? false} className={`switch ${preferences?.aiLocalAnalysisEnabled ? 'on' : ''}`} onClick={() => void setAiConsent(!(preferences?.aiLocalAnalysisEnabled ?? false))}><span /></button></label>
      </section>

      <section className="settings-section">
        <div className="settings-title"><Database size={19} /><div><h2>数据与隐私</h2><p>分析缓存只保存模型结果和内容指纹，不保存配置原文。</p></div></div>
        <div className="privacy-grid"><div><ShieldCheck size={18} /><strong>发送前自动脱敏</strong><span>识别 API Key、Token、密码和常见凭据字段。</span></div><div><FolderCheck size={18} /><strong>不会修改配置</strong><span>配置浏览和 AI 解析均为只读操作。</span></div></div>
        <div className="setting-row"><div><strong>AI 配置解析缓存</strong><span>配置、模型或提示版本变化后自动失效。</span></div><button className="button danger" onClick={() => void clearCache()}><Trash2 size={15} />清除解析缓存</button></div>
      </section>
    </div>
  )
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '操作失败，请稍后重试。'
}
