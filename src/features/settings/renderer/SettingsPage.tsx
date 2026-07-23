import { useEffect, useState, type FormEvent } from 'react'
import { Bot, Check, CircleCheck, Database, FolderCheck, KeyRound, Pencil, Plus, RefreshCw, Server, ShieldCheck, Trash2, Zap } from 'lucide-react'
import type { AiProviderPublic, AiProviderState } from '../../../platform/ai-provider/shared/contracts'
import { useInspectorState } from '../../ai-inspector/renderer'
import { CodeReviewSettingsSection } from '../../code-review/renderer'
import { PageHeader } from '../../../platform/renderer/components/PageHeader'
import './settings.css'

type ProviderDraft = { name: string; baseUrl: string; modelId: string; apiKey: string }
type Notice = { kind: 'success' | 'error'; text: string }

const emptyDraft = (): ProviderDraft => ({ name: '', baseUrl: 'https://api.openai.com/v1', modelId: 'GLM5.1', apiKey: '' })

export function SettingsPage(): React.JSX.Element {
  const { preferences, clearHistory, setAiConsent } = useInspectorState()
  const [providers, setProviders] = useState<AiProviderState>({ providers: [], activeProviderId: null })
  const [editor, setEditor] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    void window.restx.providers.getState()
      .then(setProviders)
      .catch((reason) => setNotice({ kind: 'error', text: errorMessage(reason) }))
  }, [])

  const beginCreate = (): void => { setEditor('new'); setDraft(emptyDraft()); setNotice(null) }
  const beginEdit = (provider: AiProviderPublic): void => {
    setEditor(provider.id)
    setDraft({ name: provider.name, baseUrl: provider.baseUrl, modelId: provider.modelId, apiKey: '' })
    setNotice(null)
  }

  const saveProvider = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!editor) return
    setBusy('save')
    setNotice(null)
    try {
      const next = editor === 'new'
        ? await window.restx.providers.create({ name: draft.name, baseUrl: draft.baseUrl, modelId: draft.modelId, apiKey: draft.apiKey })
        : await window.restx.providers.update({ id: editor, name: draft.name, baseUrl: draft.baseUrl, modelId: draft.modelId, ...(draft.apiKey.trim() ? { apiKey: draft.apiKey } : {}) })
      setProviders(next)
      setEditor(null)
      setDraft(emptyDraft())
      setNotice({ kind: 'success', text: editor === 'new' ? 'Provider 已新增并安全保存。' : 'Provider 已更新。' })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally { setBusy(null) }
  }

  const selectProvider = async (id: string): Promise<void> => {
    setBusy(id)
    try {
      setProviders(await window.restx.providers.setActive(id))
      setNotice({ kind: 'success', text: '当前 Provider 已切换，后续 AI 请求会立即使用它。' })
    } catch (reason) { setNotice({ kind: 'error', text: errorMessage(reason) }) } finally { setBusy(null) }
  }

  const testProvider = async (id: string): Promise<void> => {
    setBusy(`test:${id}`)
    try {
      const result = await window.restx.providers.test(id)
      setNotice({ kind: result.ok ? 'success' : 'error', text: `${result.message}（${result.durationMs} ms）` })
    } catch (reason) { setNotice({ kind: 'error', text: errorMessage(reason) }) } finally { setBusy(null) }
  }

  const deleteProvider = async (provider: AiProviderPublic): Promise<void> => {
    if (!window.confirm(`删除 Provider“${provider.name}”？`)) return
    setBusy(provider.id)
    try {
      setProviders(await window.restx.providers.delete(provider.id))
      if (editor === provider.id) setEditor(null)
      setNotice({ kind: 'success', text: 'Provider 已删除。' })
    } catch (reason) { setNotice({ kind: 'error', text: errorMessage(reason) }) } finally { setBusy(null) }
  }

  const refreshClaude = async (): Promise<void> => {
    setBusy('refresh')
    try {
      setProviders(await window.restx.providers.refreshExternal())
      setNotice({ kind: 'success', text: '已重新读取 Claude Code Provider。' })
    } catch (reason) { setNotice({ kind: 'error', text: errorMessage(reason) }) } finally { setBusy(null) }
  }

  const clearCache = async (): Promise<void> => {
    if (!window.confirm('清除所有 AI 配置解析缓存？这不会删除配置文件或 Provider。')) return
    try {
      const result = await window.restx.ai.clearAnalysisCache()
      setNotice({ kind: 'success', text: `已清除 ${result.cleared} 条 AI 解析缓存。` })
    } catch (reason) { setNotice({ kind: 'error', text: errorMessage(reason) }) }
  }

  const active = providers.providers.find((provider) => provider.id === providers.activeProviderId)

  return (
    <div className="page settings-page">
      <PageHeader eyebrow="PREFERENCES" title="设置" description="管理 RestX 的 Provider、本地数据和内容授权。" />
      {notice && <div className={`settings-notice ${notice.kind}`}>{notice.kind === 'success' ? <Check size={15} /> : <ShieldCheck size={15} />}{notice.text}</div>}

      <section className="settings-section">
        <div className="settings-title"><FolderCheck size={19} /><div><h2>已授权目录</h2><p>RestX 只能访问你通过系统选择器主动授权的目录。</p></div></div>
        <div className="setting-row"><div><strong>最近使用的目录</strong><span className="path-value">{preferences?.recentDirectory ?? '暂无授权目录'}</span></div><button className="button danger" disabled={!preferences?.recentDirectory} onClick={() => void clearHistory()}><Trash2 size={15} />清除记录</button></div>
      </section>

      <section className="settings-section provider-section unified-provider-section">
        <div className="settings-title"><Bot size={19} /><div><h2>AI Provider</h2><p>所有特性共享当前 Provider，协议统一为 OpenAI-compatible。</p></div><span className={`runtime-badge ${active?.status === 'ready' ? 'ready' : 'stopped'}`}><i />{active ? `当前：${active.name}` : '尚未选择'}</span></div>
        <div className="provider-toolbar"><div><strong>{providers.providers.length} 个 Provider</strong><span>Claude Code 凭据由外部配置托管并自动跟随刷新。</span></div><button className="button secondary" disabled={busy !== null} onClick={() => void refreshClaude()}><RefreshCw size={14} />刷新 Claude Code</button><button className="button primary" onClick={beginCreate}><Plus size={14} />新增 Provider</button></div>
        <div className="provider-list">
          {providers.providers.length === 0 && <div className="provider-empty"><Bot size={24} /><strong>还没有可用的 Provider</strong><span>新增一个 Provider，或者刷新 Claude Code 配置。</span></div>}
          {providers.providers.map((provider) => <article className={`provider-card${provider.active ? ' active' : ''}`} key={provider.id}>
            <button className="provider-select" type="button" disabled={provider.status !== 'ready' || busy !== null} onClick={() => void selectProvider(provider.id)} aria-label={`使用 ${provider.name}`}><span>{provider.active && <CircleCheck size={16} />}</span></button>
            <div className="provider-card-main"><header><strong>{provider.name}</strong><em className={provider.source}>{provider.source === 'claude-code' ? 'CLAUDE CODE' : 'MANUAL'}</em><i className={provider.status}>{provider.status === 'ready' ? '可用' : provider.status === 'unavailable' ? '不可用' : '未完成'}</i></header><span>{provider.baseUrl}</span><code>{provider.modelId}</code>{provider.statusMessage && <small>{provider.statusMessage}</small>}</div>
            <div className="provider-card-actions"><button className="button compact secondary" disabled={busy !== null || provider.status !== 'ready'} onClick={() => void testProvider(provider.id)}><Zap size={13} />{busy === `test:${provider.id}` ? '测试中…' : '测试'}</button>{provider.editable && <button className="icon-button" aria-label={`编辑 ${provider.name}`} onClick={() => beginEdit(provider)}><Pencil size={14} /></button>}{provider.editable && <button className="icon-button danger" aria-label={`删除 ${provider.name}`} disabled={busy !== null} onClick={() => void deleteProvider(provider)}><Trash2 size={14} /></button>}</div>
          </article>)}
        </div>
        {editor && <form className="provider-editor" onSubmit={(event) => void saveProvider(event)}><div className="provider-editor-head"><div><strong>{editor === 'new' ? '新增 Provider' : '编辑 Provider'}</strong><span>API Key 只在主进程中加密保存。</span></div><button className="button compact secondary" type="button" onClick={() => setEditor(null)}>取消</button></div><div className="provider-editor-fields"><label><span><Bot size={13} />名称</span><input required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如 智谱 GLM" /></label><label><span><Server size={13} />Base URL</span><input type="url" required value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /></label><label><span><Bot size={13} />模型 ID</span><input required value={draft.modelId} onChange={(event) => setDraft({ ...draft, modelId: event.target.value })} placeholder="GLM5.1" /></label><label><span><KeyRound size={13} />API Key</span><input type="password" required={editor === 'new'} autoComplete="new-password" value={draft.apiKey} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder={editor === 'new' ? '输入 API Key' : '留空表示保持不变'} /></label></div><div className="provider-actions"><button className="button primary" type="submit" disabled={busy !== null}>{busy === 'save' ? '保存中…' : '保存 Provider'}</button></div></form>}
        <label className="setting-row switch-row"><div><strong>允许 AI 分析本地配置</strong><span>仅在你手动点击解析时，发送经过脱敏的配置数据。默认关闭。</span></div><button type="button" role="switch" aria-checked={preferences?.aiLocalAnalysisEnabled ?? false} className={`switch ${preferences?.aiLocalAnalysisEnabled ? 'on' : ''}`} onClick={() => void setAiConsent(!(preferences?.aiLocalAnalysisEnabled ?? false))}><span /></button></label>
      </section>

      <CodeReviewSettingsSection />

      <section className="settings-section">
        <div className="settings-title"><Database size={19} /><div><h2>数据与隐私</h2><p>分析缓存只保存模型结果和内容指纹，不保存配置原文。</p></div></div>
        <div className="privacy-grid"><div><ShieldCheck size={18} /><strong>发送前自动脱敏</strong><span>识别 API Key、Token、密码和常见凭据字段。</span></div><div><FolderCheck size={18} /><strong>不会修改配置</strong><span>配置浏览和 AI 解析均为只读操作。</span></div></div>
        <div className="setting-row"><div><strong>AI 配置解析缓存</strong><span>配置、Provider、模型或提示版本变化后自动失效。</span></div><button className="button danger" onClick={() => void clearCache()}><Trash2 size={15} />清除解析缓存</button></div>
      </section>
    </div>
  )
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '操作失败，请稍后重试。'
}
