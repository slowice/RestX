import { useEffect, useState, type FormEvent } from 'react'
import { Database, KeyRound, LockKeyhole, Server, ShieldCheck, Trash2 } from 'lucide-react'
import type { GitCodePublicSettings, ReviewProviderPublicSettings, ReviewZone, ZoneProviderSettings } from '../../shared/contracts/code-review'
import './code-review-settings.css'

type ProviderDraft = { baseUrl: string; model: string; apiKey: string }
type Notice = { kind: 'success' | 'error'; text: string }

const emptyProviders: Record<ReviewZone, ProviderDraft> = {
  blue: { baseUrl: 'https://api.openai.com/v1', model: '', apiKey: '' },
  yellow: { baseUrl: 'https://yellow-ai.internal/v1', model: '', apiKey: '' }
}

export function CodeReviewSettingsSection(): React.JSX.Element {
  const [gitCode, setGitCode] = useState<GitCodePublicSettings | null>(null)
  const [providers, setProviders] = useState<ZoneProviderSettings | null>(null)
  const [drafts, setDrafts] = useState<Record<ReviewZone, ProviderDraft>>(emptyProviders)
  const [gitCodeToken, setGitCodeToken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const syncProviders = (next: ZoneProviderSettings): void => {
    setProviders(next)
    setDrafts((current) => ({
      blue: { ...current.blue, baseUrl: next.blue.baseUrl, model: next.blue.model, apiKey: '' },
      yellow: { ...current.yellow, baseUrl: next.yellow.baseUrl, model: next.yellow.model, apiKey: '' }
    }))
  }

  useEffect(() => {
    void Promise.all([window.restx.codeReview.getGitCodeSettings(), window.restx.codeReview.getZoneProviders()])
      .then(([nextGitCode, nextProviders]) => {
        setGitCode(nextGitCode)
        syncProviders(nextProviders)
      })
      .catch((reason) => setNotice({ kind: 'error', text: errorMessage(reason) }))
  }, [])

  const saveGitCode = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!gitCodeToken.trim()) return
    setBusy('gitcode')
    setNotice(null)
    try {
      setGitCode(await window.restx.codeReview.updateGitCodeSettings({ accessToken: gitCodeToken }))
      setGitCodeToken('')
      const connection = await window.restx.codeReview.testGitCodeConnection()
      setNotice({ kind: connection.ok ? 'success' : 'error', text: connection.message })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setBusy(null)
    }
  }

  const testGitCode = async (): Promise<void> => {
    setBusy('gitcode')
    try {
      const connection = await window.restx.codeReview.testGitCodeConnection()
      setNotice({ kind: connection.ok ? 'success' : 'error', text: connection.message })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setBusy(null)
    }
  }

  const removeGitCode = async (): Promise<void> => {
    setBusy('gitcode')
    try {
      setGitCode(await window.restx.codeReview.updateGitCodeSettings({ clearAccessToken: true }))
      setNotice({ kind: 'success', text: 'GitCode PAT 已从安全存储中移除。' })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setBusy(null)
    }
  }

  const saveProvider = async (zone: ReviewZone, event: FormEvent): Promise<void> => {
    event.preventDefault()
    const draft = drafts[zone]
    setBusy(zone)
    setNotice(null)
    try {
      const next = await window.restx.codeReview.updateZoneProvider({
        zone,
        settings: { baseUrl: draft.baseUrl, model: draft.model, ...(draft.apiKey.trim() ? { apiKey: draft.apiKey } : {}) }
      })
      syncProviders(next)
      setNotice({ kind: 'success', text: `${zone === 'blue' ? '蓝区' : '黄区'} AI 配置已安全保存。` })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setBusy(null)
    }
  }

  const removeProviderKey = async (zone: ReviewZone): Promise<void> => {
    const draft = drafts[zone]
    setBusy(zone)
    try {
      const next = await window.restx.codeReview.updateZoneProvider({ zone, settings: { baseUrl: draft.baseUrl, model: draft.model, clearApiKey: true } })
      syncProviders(next)
      setNotice({ kind: 'success', text: `${zone === 'blue' ? '蓝区' : '黄区'} API Key 已移除。` })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setBusy(null)
    }
  }

  const clearCache = async (): Promise<void> => {
    if (!window.confirm('清除全部代码自检缓存？')) return
    try {
      const result = await window.restx.codeReview.clearCache()
      setNotice({ kind: 'success', text: `已清除 ${result.cleared} 条代码自检缓存。` })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    }
  }

  return <>
    {notice && <div className={`settings-notice ${notice.kind}`}><ShieldCheck size={15} />{notice.text}</div>}
    <section className="settings-section provider-section code-review-settings">
      <div className="settings-title"><KeyRound size={19} /><div><h2>代码自检连接</h2><p>GitCode PAT 和两个网络区域的 AI 凭据均由系统安全存储保护。</p></div><span className={`runtime-badge ${gitCode?.accessTokenConfigured ? 'ready' : 'stopped'}`}><i />{gitCode?.accessTokenConfigured ? 'GitCode 已配置' : 'GitCode 待配置'}</span></div>
      <form className="provider-form gitcode-form" onSubmit={(event) => void saveGitCode(event)}>
        <label><span><Server size={14} />GitCode API</span><input disabled value={gitCode?.apiBaseUrl ?? 'https://api.gitcode.com/api/v5'} /></label>
        <label><span><KeyRound size={14} />个人访问令牌（PAT）</span><input type="password" autoComplete="new-password" value={gitCodeToken} onChange={(event) => setGitCodeToken(event.target.value)} placeholder={gitCode?.accessTokenConfigured ? '已安全保存；输入新令牌可替换' : '输入 GitCode PAT'} /><small>令牌不会显示、写入日志或发送给 AI。</small></label>
        <div className="provider-actions"><button className="button primary" type="submit" disabled={busy !== null || !gitCodeToken.trim()}>{busy === 'gitcode' ? '处理中…' : '保存并测试'}</button><button className="button secondary" type="button" disabled={busy !== null || !gitCode?.accessTokenConfigured} onClick={() => void testGitCode()}>测试连接</button>{gitCode?.accessTokenConfigured && <button className="button danger" type="button" disabled={busy !== null} onClick={() => void removeGitCode()}>移除 PAT</button>}</div>
      </form>
      <div className="review-provider-settings">
        {(['blue', 'yellow'] as const).map((zone) => <ProviderForm key={zone} zone={zone} value={drafts[zone]} settings={providers?.[zone] ?? null} busy={busy !== null} onChange={(next) => setDrafts((current) => ({ ...current, [zone]: next }))} onSubmit={(event) => void saveProvider(zone, event)} onRemove={() => void removeProviderKey(zone)} />)}
      </div>
      <div className="setting-row"><div><strong>代码自检缓存</strong><span>结构化检视结果加密保存七天，MR、模型或规则变化后自动失效。</span></div><button className="button danger" type="button" onClick={() => void clearCache()}><Trash2 size={15} />清除自检缓存</button></div>
    </section>
  </>
}

function ProviderForm({ zone, value, settings, busy, onChange, onSubmit, onRemove }: { zone: ReviewZone; value: ProviderDraft; settings: ReviewProviderPublicSettings | null; busy: boolean; onChange: (value: ProviderDraft) => void; onSubmit: (event: FormEvent) => void; onRemove: () => void }): React.JSX.Element {
  const label = zone === 'blue' ? '蓝区 · 开放区 AI' : '黄区 · 内部 AI'
  return <form className={`review-zone-provider-form ${zone}`} onSubmit={onSubmit}>
    <header>{zone === 'blue' ? <ShieldCheck size={18} /> : <LockKeyhole size={18} />}<div><strong>{label}</strong><span>OpenAI-compatible · {settings?.apiKeyConfigured && settings.model ? '已就绪' : '待配置'}</span></div></header>
    <label><span>Base URL</span><input value={value.baseUrl} onChange={(event) => onChange({ ...value, baseUrl: event.target.value })} /></label>
    <label><span>模型</span><input value={value.model} onChange={(event) => onChange({ ...value, model: event.target.value })} placeholder="模型名称" /></label>
    <label><span>API Key</span><input type="password" autoComplete="new-password" value={value.apiKey} onChange={(event) => onChange({ ...value, apiKey: event.target.value })} placeholder={settings?.apiKeyConfigured ? '已安全保存；留空则保持不变' : '输入 API Key'} /></label>
    <div><button className="button primary" type="submit" disabled={busy || !value.baseUrl.trim() || !value.model.trim()}>保存配置</button>{settings?.apiKeyConfigured && <button className="button danger" type="button" disabled={busy} onClick={onRemove}>移除 Key</button>}</div>
  </form>
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '操作失败，请稍后重试。'
}
