import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Server, ShieldCheck, Trash2 } from 'lucide-react'
import type { GitCodePublicSettings } from '../../shared/contracts/code-review'
import './code-review-settings.css'

type Notice = { kind: 'success' | 'error'; text: string }

export function CodeReviewSettingsSection(): React.JSX.Element {
  const [gitCode, setGitCode] = useState<GitCodePublicSettings | null>(null)
  const [gitCodeToken, setGitCodeToken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    void window.restx.codeReview.getGitCodeSettings()
      .then(setGitCode)
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
      <div className="settings-title"><KeyRound size={19} /><div><h2>代码自检连接</h2><p>这里只管理代码来源凭据；AI 模型统一使用上方当前 Provider。</p></div><span className={`runtime-badge ${gitCode?.accessTokenConfigured ? 'ready' : 'stopped'}`}><i />{gitCode?.accessTokenConfigured ? 'GitCode 已配置' : 'GitCode 待配置'}</span></div>
      <form className="provider-form gitcode-form" onSubmit={(event) => void saveGitCode(event)}>
        <label><span><Server size={14} />GitCode API</span><input disabled value={gitCode?.apiBaseUrl ?? 'https://api.gitcode.com/api/v5'} /></label>
        <label><span><KeyRound size={14} />个人访问令牌（PAT）</span><input type="password" autoComplete="new-password" value={gitCodeToken} onChange={(event) => setGitCodeToken(event.target.value)} placeholder={gitCode?.accessTokenConfigured ? '已安全保存；输入新令牌可替换' : '输入 GitCode PAT'} /><small>令牌不会显示、写入日志或发送给 AI。</small></label>
        <div className="provider-actions"><button className="button primary" type="submit" disabled={busy !== null || !gitCodeToken.trim()}>{busy === 'gitcode' ? '处理中…' : '保存并测试'}</button><button className="button secondary" type="button" disabled={busy !== null || !gitCode?.accessTokenConfigured} onClick={() => void testGitCode()}>测试连接</button>{gitCode?.accessTokenConfigured && <button className="button danger" type="button" disabled={busy !== null} onClick={() => void removeGitCode()}>移除 PAT</button>}</div>
      </form>
      <div className="setting-row"><div><strong>代码自检缓存</strong><span>结构化检视结果加密保存七天，MR、模型或规则变化后自动失效。</span></div><button className="button danger" type="button" onClick={() => void clearCache()}><Trash2 size={15} />清除自检缓存</button></div>
    </section>
  </>
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '操作失败，请稍后重试。'
}
