import { useEffect, useMemo } from 'react'
import { AlertTriangle, ArrowRight, Bot, Braces, CheckCircle2, ChevronRight, CircleDot, Code2, FileCode2, FileSearch, GitPullRequest, KeyRound, Layers3, LoaderCircle, LockKeyhole, RefreshCw, Search, ShieldAlert, ShieldCheck, Sparkles, TestTube2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CodeReviewResult, GitCodeMergeRequestList, GitCodeMergeRequestSummary, MergeRequestReviewState, ReviewCategory, ReviewFinding, ReviewSeverity, ReviewSourcePreview, ReviewZone } from '../shared/contracts/code-review'
import { PageHeader } from '../../../platform/renderer/components/PageHeader'
import { chooseZone, loadMyMergeRequests, loadPreview, runReview, selectMergeRequest, setCategory, setRequirements, setSeverity, setUrl, useReviewSession } from './review-session'
import './code-review.css'

const severityLabels: Record<ReviewSeverity, string> = { P0: '致命', P1: '高风险', P2: '建议修复', P3: '优化建议' }
const categoryLabels: Record<ReviewCategory, string> = { security: '安全', bug: '低级错误', logging: '日志', consistency: '一致性', test: '测试', maintainability: '可维护性' }
const ruleCards = [
  { icon: ShieldAlert, name: '安全基线', detail: '注入、越权、敏感信息与危险 API' },
  { icon: Braces, name: '低级错误', detail: '空值、边界、异常、事务与并发' },
  { icon: Layers3, name: '日志规范', detail: '只打印脱敏描述，不打印异常堆栈' },
  { icon: TestTube2, name: '通用检视准则', detail: '证据、需求、架构、性能与测试有效性' },
  { icon: Code2, name: '语言专项', detail: 'Java、MyBatis、SQL 与 TypeScript' },
  { icon: ShieldCheck, name: '自定义规则补全', detail: '低级代码错误、Java 具体异常、日志与 console 禁止堆栈' }
]

export function CodeReviewPage(): React.JSX.Element {
  const { zone, url, requirements, status, preview, result, error, severity, category,
    mergeRequestList, mergeRequestListStatus, mergeRequestListError } = useReviewSession()
  const busy = status === 'loading' || status === 'reviewing'

  useEffect(() => {
    if (zone === 'blue') void loadMyMergeRequests()
  }, [zone])

  const filteredFindings = useMemo(() => (result?.findings ?? []).filter((finding) =>
    (severity === 'all' || finding.severity === severity) && (category === 'all' || finding.category === category)
  ), [result, severity, category])

  const severityCounts = useMemo(() => ({
    P0: result?.findings.filter((item) => item.severity === 'P0').length ?? 0,
    P1: result?.findings.filter((item) => item.severity === 'P1').length ?? 0,
    P2: result?.findings.filter((item) => item.severity === 'P2').length ?? 0,
    P3: result?.findings.filter((item) => item.severity === 'P3').length ?? 0
  }), [result])

  return (
    <div className="page code-review-page">
      <PageHeader eyebrow="AI CODE REVIEW" title="代码自检" description="在提交前检查 AI 生成代码的安全、低级错误、日志和仓库一致性。代码来源与模型区域由主进程强制匹配。" />

      <section className="review-zone-switch" aria-label="网络区域">
        <button className={`zone-option blue${zone === 'blue' ? ' active' : ''}`} disabled={busy} onClick={() => chooseZone('blue')}>
          <span className="zone-icon"><ShieldCheck size={20} /></span><span><b>蓝区 · 开放区</b><small>GitCode · 蓝区 AI</small></span>{zone === 'blue' && <CheckCircle2 size={17} />}
        </button>
        <button className={`zone-option yellow${zone === 'yellow' ? ' active' : ''}`} disabled={busy} onClick={() => chooseZone('yellow')}>
          <span className="zone-icon"><LockKeyhole size={20} /></span><span><b>黄区 · 代码保密区</b><small>CodeHub · 内部 AI · 禁止降级</small></span>{zone === 'yellow' && <CheckCircle2 size={17} />}
        </button>
        <div className={`zone-policy ${zone}`}><CircleDot size={14} /><span>{zone === 'blue' ? '当前只允许 GitCode 来源发送到蓝区模型' : '黄区代码只能发送到黄区内部模型'}</span></div>
      </section>

      <div className="review-workspace">
        <aside className="review-setup-panel">
          <div className="review-section-title"><span>01</span><div><strong>选择代码来源</strong><small>首版支持 MR / PR 链接</small></div></div>
          <div className={`source-provider-card ${zone}`}>
            <div className="source-provider-icon">{zone === 'blue' ? <GitPullRequest size={21} /> : <LockKeyhole size={21} />}</div>
            <div><strong>{zone === 'blue' ? 'GitCode Pull Request' : 'CodeHub Merge Request'}</strong><small>{zone === 'blue' ? '官方 API v5 · 只读访问' : '适配框架已完成 · 待黄区补充 API'}</small></div>
            <b>{zone === 'blue' ? '可用' : '待接入'}</b>
          </div>
          {zone === 'blue' && <MyMergeRequests
            data={mergeRequestList}
            status={mergeRequestListStatus}
            error={mergeRequestListError}
            selectedUrl={url}
            disabled={busy}
            onRefresh={() => void loadMyMergeRequests()}
            onSelect={selectMergeRequest}
          />}
          <label className="review-field"><span>{zone === 'blue' ? '或者手动粘贴链接' : 'MR / PR 链接'}</span><div className="review-url-input"><GitPullRequest size={16} /><input type="url" value={url} disabled={zone === 'yellow' || busy} onChange={(event) => setUrl(event.target.value)} placeholder={zone === 'blue' ? 'https://gitcode.com/owner/repo/pull/123' : '进入黄区后配置 CodeHub 域名'} /></div></label>
          {zone === 'blue' && <button className="example-link" type="button" disabled={busy} onClick={() => setUrl('https://gitcode.com/OpenMatrix/MatrixAssistant/pull/1958')}>使用示例：MatrixAssistant #1958 <ArrowRight size={13} /></button>}
          {zone === 'yellow' && <div className="adapter-note"><LockKeyhole size={15} /><span>蓝区无法访问 CodeHub。进入黄区后只需补充 URL、认证和 diff 请求函数，页面与检视流程无需改动。</span></div>}

          <div className="review-section-title second"><span>02</span><div><strong>检视要求</strong><small>通用、安全、日志及自定义规则始终启用；语言专项自动匹配</small></div></div>
          <div className="review-rule-grid">{ruleCards.map(({ icon: Icon, name, detail }) => <div key={name}><Icon size={15} /><span><b>{name}</b><small>{detail}</small></span><CheckCircle2 size={13} /></div>)}</div>
          <label className="review-field"><span>补充要求 <i>可选</i></span><textarea maxLength={8000} disabled={busy} value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="例如：重点检查批量更新、事务边界和敏感日志……" /></label>
          <button className="button primary review-primary-action" disabled={zone === 'yellow' || !url.trim() || status === 'loading' || status === 'reviewing'} onClick={() => void loadPreview()}>{status === 'loading' ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}{status === 'loading' ? '正在读取 PR…' : preview ? '重新读取变更' : '读取变更并预览'}</button>
          <div className="review-readonly"><ShieldCheck size={14} /><span>只读访问 · 不 fetch · 不执行仓库脚本 · 不回写评论</span></div>
        </aside>

        <main className="review-output-panel">
          {status === 'idle' && <ReviewWelcome zone={zone} />}
          {status === 'loading' && <ReviewLoading text="正在通过 GitCode API 获取 PR 元数据和文件变更…" />}
          {status === 'reviewing' && <ReviewLoading text="正在按规则分批检视代码，代码正文不会写入调用日志…" />}
          {status === 'error' && <ReviewError message={error} hasPreview={Boolean(preview)} onRetry={() => preview ? void runReview(true) : void loadPreview()} />}
          {(status === 'ready' || (status === 'completed' && !result)) && preview && <ReviewPreview preview={preview} onRun={() => void runReview(false)} />}
          {status === 'completed' && result && <ReviewResults result={result} findings={filteredFindings} counts={severityCounts} severity={severity} category={category} onSeverity={setSeverity} onCategory={setCategory} onRefresh={() => void runReview(true)} />}
        </main>
      </div>
    </div>
  )
}

function MyMergeRequests({ data, status, error, selectedUrl, disabled, onRefresh, onSelect }: {
  data: GitCodeMergeRequestList | null
  status: 'loading' | 'ready' | 'error'
  error: string
  selectedUrl: string
  disabled: boolean
  onRefresh: () => void
  onSelect: (mergeRequest: GitCodeMergeRequestSummary) => void
}): React.JSX.Element {
  return <section className="my-merge-requests">
    <header><div><strong>我的开放 MR</strong><small>按最近更新排序</small></div><button className="icon-button" type="button" title="刷新我的 MR" aria-label="刷新我的 MR" disabled={status === 'loading'} onClick={onRefresh}><RefreshCw className={status === 'loading' ? 'spin' : ''} size={14} /></button></header>
    {status === 'loading' && <div className="mr-list-message"><LoaderCircle className="spin" size={15} /><span>正在匹配 Git 身份并读取 MR…</span></div>}
    {status === 'error' && <div className="mr-list-error"><AlertTriangle size={15} /><span>{error}</span>{/PAT|认证|令牌/.test(error) && <Link to="/settings">前往设置</Link>}</div>}
    {status === 'ready' && data && <>
      <IdentityMatch identity={data.identity} />
      <div className="mr-choice-list">
        {data.mergeRequests.map((mergeRequest) => <button
          className={`mr-choice${selectedUrl === mergeRequest.locator.webUrl ? ' selected' : ''}`}
          type="button"
          aria-pressed={selectedUrl === mergeRequest.locator.webUrl}
          key={mergeRequest.sourceId}
          disabled={disabled}
          onClick={() => onSelect(mergeRequest)}
        >
          <span className="mr-choice-main"><b>{mergeRequest.locator.owner}/{mergeRequest.locator.repository} #{mergeRequest.locator.number}</b><strong>{mergeRequest.draft ? '[草稿] ' : ''}{mergeRequest.title}</strong><small>{mergeRequest.headBranch} → {mergeRequest.baseBranch}{mergeRequest.updatedAt ? ` · ${formatDateTime(mergeRequest.updatedAt)}` : ''}</small></span>
          <ReviewState state={mergeRequest.review} />
        </button>)}
        {!data.mergeRequests.length && <div className="mr-list-empty"><GitPullRequest size={18} /><span><b>当前没有开放 MR</b><small>仍可在下方手动粘贴其他 MR 链接</small></span></div>}
      </div>
    </>}
  </section>
}

function IdentityMatch({ identity }: { identity: GitCodeMergeRequestList['identity'] }): React.JSX.Element {
  const copy = identity.match === 'matched'
    ? `已匹配本地 Git：${identity.localGitEmail}`
    : identity.match === 'mismatched'
      ? `PAT 账号与本地邮箱不一致：${identity.localGitEmail}`
      : identity.match === 'local-email-unavailable'
        ? '未配置全局 Git 邮箱，当前按 PAT 账号展示'
        : 'GitCode 未返回邮箱，当前按 PAT 账号展示'
  return <div className={`git-identity ${identity.match}`}><CircleDot size={13} /><span><b>{identity.accountName}</b><small>{copy}</small></span></div>
}

function ReviewState({ state }: { state: MergeRequestReviewState }): React.JSX.Element {
  if (state.status === 'passed') return <span className="mr-review-state passed"><CheckCircle2 size={12} />检视通过</span>
  if (state.status === 'issues') return <span className="mr-review-state issues"><AlertTriangle size={12} />{state.findingCount ?? 0} 个问题</span>
  if (state.status === 'stale') return <span className="mr-review-state stale"><RefreshCw size={12} />代码已更新</span>
  return <span className="mr-review-state unreviewed">未检视</span>
}

function ReviewWelcome({ zone }: { zone: ReviewZone }): React.JSX.Element {
  return <div className="review-welcome"><div className={`review-orb ${zone}`}><FileSearch size={37} /><span /><span /></div><em>READY FOR REVIEW</em><h2>{zone === 'blue' ? '粘贴 GitCode PR，先预览再发送' : 'CodeHub 检视框架已准备好'}</h2><p>{zone === 'blue' ? 'RestX 会先读取并展示文件范围、增删行和排除项。只有点击“开始 AI 检视”后，合格的 diff 才会发送到蓝区模型。' : '黄区适配器已与检视引擎解耦。获得 CodeHub API 后补充核心函数，即可自动启用相同的预览和结果界面。'}</p><div className="welcome-steps"><span><b>1</b>读取 PR</span><ChevronRight size={14} /><span><b>2</b>确认范围</span><ChevronRight size={14} /><span><b>3</b>AI 检视</span><ChevronRight size={14} /><span><b>4</b>定位问题</span></div></div>
}

function ReviewLoading({ text }: { text: string }): React.JSX.Element {
  return <div className="review-loading"><div className="loading-rings"><Bot size={29} /><i /><i /></div><h2>代码自检处理中</h2><p>{text}</p><div className="review-progress"><span /></div><small>可切换到其他页面，返回后继续查看；请勿关闭或刷新应用</small></div>
}

function ReviewError({ message, hasPreview, onRetry }: { message: string; hasPreview: boolean; onRetry: () => void }): React.JSX.Element {
  const auth = /PAT|认证|令牌/.test(message)
  return <div className="review-error-state"><div><AlertTriangle size={29} /></div><h2>{auth ? '需要配置 GitCode PAT' : '暂时无法继续检视'}</h2><p>{message}</p><span>已获取的代码不会因为失败而发送到其他网络区域。</span><div className="review-error-actions">{auth && <Link className="button secondary" to="/settings"><KeyRound size={15} />前往设置</Link>}<button className="button primary" onClick={onRetry}><RefreshCw size={15} />{hasPreview ? '重新检视' : '重试读取'}</button></div></div>
}

function ReviewPreview({ preview, onRun }: { preview: ReviewSourcePreview; onRun: () => void }): React.JSX.Element {
  return <div className="review-preview"><header><div className="preview-pr-icon"><GitPullRequest size={22} /></div><div><span>{preview.locator.owner} / {preview.locator.repository}</span><h2>#{preview.locator.number} {preview.title}</h2><small>{preview.headBranch} <ArrowRight size={11} /> {preview.baseBranch} · {preview.author ?? '未知作者'}</small></div><b className={`pr-state ${preview.state.toLowerCase()}`}>{preview.state}</b></header><div className="preview-metrics"><div><strong>{preview.files.length}</strong><span>变更文件</span></div><div className="plus"><strong>+{preview.additions}</strong><span>新增行</span></div><div className="minus"><strong>-{preview.deletions}</strong><span>删除行</span></div><div><strong>{formatCharacters(preview.inputCharacters)}</strong><span>预计输入</span></div></div><div className="preview-context-note"><AlertTriangle size={14} /><span>远程 MR 模式：已包含 diff 与变更行；尚未绑定本地仓库，相似代码检索为受限模式。</span></div><section className="preview-files"><div className="preview-files-head"><strong>发送文件预览</strong><span>{preview.eligibleFiles} 个发送 · {preview.excludedFiles} 个排除</span></div>{preview.files.map((file) => <div className={`preview-file${file.eligible ? '' : ' excluded'}`} key={`${file.oldPath ?? ''}:${file.path}`}><FileCode2 size={15} /><div><strong>{file.path}</strong>{file.oldPath && <small>原路径：{file.oldPath}</small>}</div><span className={`file-status ${file.status}`}>{statusLabel(file.status)}</span><code className="file-lines"><i>+{file.additions}</i><b>-{file.deletions}</b></code>{file.eligible ? <CheckCircle2 size={14} /> : <span className="exclude-reason">{file.exclusionReason}</span>}</div>)}</section><footer><div><ShieldCheck size={16} /><span><strong>发送目标：蓝区 AI</strong><small>请求日志仅记录数量、耗时和状态，不记录代码正文</small></span></div><button className="button primary large" disabled={!preview.eligibleFiles} onClick={onRun}><Sparkles size={16} />开始 AI 检视</button></footer></div>
}

function ReviewResults({ result, findings, counts, severity, category, onSeverity, onCategory, onRefresh }: { result: CodeReviewResult; findings: ReviewFinding[]; counts: Record<ReviewSeverity, number>; severity: ReviewSeverity | 'all'; category: ReviewCategory | 'all'; onSeverity: (value: ReviewSeverity | 'all') => void; onCategory: (value: ReviewCategory | 'all') => void; onRefresh: () => void }): React.JSX.Element {
  return <div className="review-results"><header><div className="result-success"><CheckCircle2 size={23} /></div><div><span>检视完成 · {result.cacheStatus === 'hit' ? '命中七天缓存' : result.cacheStatus === 'refresh' ? '已强制刷新' : 'AI 实时分析'}</span><h2>{result.findings.length ? `发现 ${result.findings.length} 个需要关注的问题` : '本次变更未发现明确问题'}</h2><p>{result.summary}</p></div><button className="icon-button" title="忽略缓存重新检视" onClick={onRefresh}><RefreshCw size={15} /></button></header><div className="result-severity-grid">{(['P0', 'P1', 'P2', 'P3'] as ReviewSeverity[]).map((item) => <button className={`${item.toLowerCase()}${severity === item ? ' active' : ''}`} onClick={() => onSeverity(severity === item ? 'all' : item)} key={item}><span>{item}</span><strong>{counts[item]}</strong><small>{severityLabels[item]}</small></button>)}</div><div className="result-toolbar"><div className="category-filters"><button className={category === 'all' ? 'active' : ''} onClick={() => onCategory('all')}>全部</button>{(Object.keys(categoryLabels) as ReviewCategory[]).map((item) => <button className={category === item ? 'active' : ''} onClick={() => onCategory(item)} key={item}>{categoryLabels[item]}</button>)}</div><span>{findings.length} 条结果</span></div><section className="finding-list">{findings.length ? findings.map((finding) => <FindingCard finding={finding} key={finding.id} />) : <div className="no-findings"><CheckCircle2 size={27} /><strong>当前筛选下没有问题</strong><span>AI 建议仍需结合测试和人工判断确认。</span></div>}</section><footer className="result-footer"><span><Bot size={14} />{result.model}</span><span><FileCode2 size={14} />检视 {result.reviewedFiles} 个文件</span><span><ShieldCheck size={14} />规则 {result.rules.map((rule) => rule.name).join('、')}</span><time>{new Date(result.analyzedAt).toLocaleString()}</time></footer></div>
}

function FindingCard({ finding }: { finding: ReviewFinding }): React.JSX.Element {
  const Icon = finding.category === 'security' ? ShieldAlert : finding.category === 'test' ? TestTube2 : finding.category === 'logging' ? Layers3 : Code2
  return <article className={`finding-card ${finding.severity.toLowerCase()}`}><div className="finding-marker"><Icon size={17} /></div><div className="finding-main"><div className="finding-head"><span className={`severity-badge ${finding.severity.toLowerCase()}`}>{finding.severity} · {severityLabels[finding.severity]}</span><span className="category-badge">{categoryLabels[finding.category]}</span><span className="confidence">置信度 {confidenceLabel(finding.confidence)}</span></div><h3>{finding.title}</h3><p>{finding.explanation}</p><div className="finding-location"><FileCode2 size={13} /><code>{finding.filePath}:{finding.startLine}{finding.endLine && finding.endLine !== finding.startLine ? `-${finding.endLine}` : ''}</code><span>{finding.ruleId}</span></div><blockquote>{finding.evidence}</blockquote>{finding.suggestion && <div className="finding-suggestion"><Sparkles size={13} /><span><b>修复建议</b>{finding.suggestion}</span></div>}</div></article>
}

function statusLabel(status: ReviewSourcePreview['files'][number]['status']): string { return ({ added: '新增', modified: '修改', deleted: '删除', renamed: '重命名', unknown: '变更' })[status] }
function confidenceLabel(value: ReviewFinding['confidence']): string { return ({ high: '高', medium: '中', low: '低' })[value] }
function formatCharacters(value: number): string { return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value) }
function formatDateTime(value: string): string { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toLocaleDateString() : value }
