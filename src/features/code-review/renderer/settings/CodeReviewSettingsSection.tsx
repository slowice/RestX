import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Server, ShieldCheck, Trash2 } from 'lucide-react'
import type { CodeHubPublicSettings, GitCodePublicSettings } from '../../shared/contracts/code-review'
import './code-review-settings.css'

type Notice = { kind: 'success' | 'error'; text: string }

export function CodeReviewSettingsSection(): React.JSX.Element {
  const [gitCode, setGitCode] = useState<GitCodePublicSettings | null>(null)
  const [gitCodeToken, setGitCodeToken] = useState('')
  const [codeHub, setCodeHub] = useState<CodeHubPublicSettings | null>(null)
  const [codeHubToken, setCodeHubToken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    void Promise.all([
      window.restx.codeReview.getGitCodeSettings(),
      window.restx.codeReview.getCodeHubSettings()
    ])
      .then(([gitCodeSettings, codeHubSettings]) => {
        setGitCode(gitCodeSettings)
        setCodeHub(codeHubSettings)
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

  const saveCodeHub = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!codeHubToken.trim()) return
    setBusy('codehub')
    setNotice(null)
    try {
      setCodeHub(await window.restx.codeReview.updateCodeHubSettings({ privateToken: codeHubToken }))
      setCodeHubToken('')
      setNotice({ kind: 'success', text: 'CodeHub PRIVATE-TOKEN 已安全保存。' })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setBusy(null)
    }
  }

  const removeCodeHub = async (): Promise<void> => {
    setBusy('codehub')
    try {
      setCodeHub(await window.restx.codeReview.updateCodeHubSettings({ clearPrivateToken: true }))
      setNotice({ kind: 'success', text: 'CodeHub PRIVATE-TOKEN 已从安全存储中移除。' })
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
      <div className="settings-title"><KeyRound size={19} /><div><h2>代码自检连接</h2><p>这里只管理代码来源凭据；AI 模型统一使用上方当前 Provider。</p></div><div className="source-credential-badges"><span className={`runtime-badge ${gitCode?.accessTokenConfigured ? 'ready' : 'stopped'}`}><i />{gitCode?.accessTokenConfigured ? 'GitCode 已配置' : 'GitCode 待配置'}</span><span className={`runtime-badge ${codeHub?.privateTokenConfigured ? 'ready' : 'stopped'}`}><i />{codeHub?.privateTokenConfigured ? 'CodeHub 已配置' : 'CodeHub 待配置'}</span></div></div>
      <form className="provider-form gitcode-form" onSubmit={(event) => void saveGitCode(event)}>
        <label><span><Server size={14} />GitCode API</span><input disabled value={gitCode?.apiBaseUrl ?? 'https://api.gitcode.com/api/v5'} /></label>
        <label><span><KeyRound size={14} />个人访问令牌（PAT）</span><input type="password" autoComplete="new-password" value={gitCodeToken} onChange={(event) => setGitCodeToken(event.target.value)} placeholder={gitCode?.accessTokenConfigured ? '已安全保存；输入新令牌可替换' : '输入 GitCode PAT'} /><small>令牌不会显示、写入日志或发送给 AI。</small></label>
        <div className="provider-actions"><button className="button primary" type="submit" disabled={busy !== null || !gitCodeToken.trim()}>{busy === 'gitcode' ? '处理中…' : '保存并测试'}</button><button className="button secondary" type="button" disabled={busy !== null || !gitCode?.accessTokenConfigured} onClick={() => void testGitCode()}>测试连接</button>{gitCode?.accessTokenConfigured && <button className="button danger" type="button" disabled={busy !== null} onClick={() => void removeGitCode()}>移除 PAT</button>}</div>
      </form>
      <form className="provider-form codehub-form" onSubmit={(event) => void saveCodeHub(event)}>
        <label><span><Server size={14} />CodeHub 认证请求头</span><input disabled value="PRIVATE-TOKEN" /></label>
        <label><span><KeyRound size={14} />PRIVATE-TOKEN</span><input type="password" autoComplete="new-password" value={codeHubToken} onChange={(event) => setCodeHubToken(event.target.value)} placeholder={codeHub?.privateTokenConfigured ? '已安全保存；输入新 Token 可替换' : '输入 CodeHub PRIVATE-TOKEN'} /><small>当前仅安全保存；后续 CodeHub API 将通过 PRIVATE-TOKEN 请求头使用。</small></label>
        <div className="provider-actions"><button className="button primary" type="submit" disabled={busy !== null || !codeHubToken.trim()}>{busy === 'codehub' ? '处理中…' : '保存 PRIVATE-TOKEN'}</button>{codeHub?.privateTokenConfigured && <button className="button danger" type="button" disabled={busy !== null} onClick={() => void removeCodeHub()}>移除 PRIVATE-TOKEN</button>}</div>
      </form>
      <div className="setting-row"><div><strong>代码自检缓存</strong><span>结构化检视结果加密保存七天，MR、模型或规则变化后自动失效。</span></div><button className="button danger" type="button" onClick={() => void clearCache()}><Trash2 size={15} />清除自检缓存</button></div>
    </section>
  </>
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '操作失败，请稍后重试。'
}
