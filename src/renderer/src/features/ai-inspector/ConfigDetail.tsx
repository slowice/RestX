import { useEffect, useState } from 'react'
import { AlertTriangle, Bot, Braces, CheckCircle2, ChevronRight, Clock3, FileCode2, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AiAnalysisRecord, AiAnalysisResponse, AiProviderPublicSettings } from '../../../../shared/contracts/ai-capability'
import type { ConfigDocument, ConfigValue } from '../../../../shared/contracts/config'
import { useAppState } from '../../app/AppState'
import { formatBytes, formatDate } from '../../shared/format'

type View = 'data' | 'ai'
type DataView = 'tree' | 'text'

export function ConfigDetail({ document, onClose }: { document: ConfigDocument; onClose: () => void }): React.JSX.Element {
  const [view, setView] = useState<View>('data')
  const [dataView, setDataView] = useState<DataView>(document.data ? 'tree' : 'text')

  useEffect(() => {
    setView('data')
    setDataView(document.data ? 'tree' : 'text')
  }, [document.path, document.sourceHash])

  return (
    <aside className="config-detail">
      <header className="detail-header">
        <div className="detail-file-icon"><FileCode2 size={19} /></div>
        <div><strong>{document.name}</strong><span title={document.path}>{document.path}</span></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭配置详情"><X size={16} /></button>
      </header>
      <div className="detail-meta">
        <span>{document.format.toUpperCase()}</span><span>{formatBytes(document.sizeBytes)}</span><span>{formatDate(document.modifiedAt)}</span>
        <span className="redaction-count"><ShieldCheck size={12} />已脱敏 {document.redactionCount} 项</span>
      </div>
      <div className="detail-tabs">
        <button className={view === 'data' ? 'active' : ''} onClick={() => setView('data')}><Braces size={15} />配置数据</button>
        <button className={view === 'ai' ? 'active' : ''} onClick={() => setView('ai')}><Bot size={15} />AI 解析</button>
      </div>

      {view === 'data' ? (
        <div className="detail-body">
          {document.parseError && <div className="detail-alert"><AlertTriangle size={15} /><span><strong>结构化解析失败</strong>{document.parseError}，你仍可查看脱敏文本。</span></div>}
          {document.data && <div className="data-view-toggle"><button className={dataView === 'tree' ? 'active' : ''} onClick={() => setDataView('tree')}>树形</button><button className={dataView === 'text' ? 'active' : ''} onClick={() => setDataView('text')}>文本</button></div>}
          {dataView === 'tree' && document.data ? <ConfigTree value={document.data} /> : <pre className="config-source">{document.redactedText}</pre>}
        </div>
      ) : <AnalysisPanel document={document} />}
    </aside>
  )
}

function ConfigTree({ value, depth = 0, label }: { value: ConfigValue; depth?: number; label?: string }): React.JSX.Element {
  if (value === null || typeof value !== 'object') {
    return <div className="tree-row scalar" style={{ paddingLeft: depth * 16 }}>{label && <span className="tree-key">{label}</span>}<span className={`tree-value ${typeof value}`}>{formatScalar(value)}</span></div>
  }
  const entries = Array.isArray(value) ? value.map((child, index) => [String(index), child] as const) : Object.entries(value)
  return (
    <div className={depth === 0 ? 'config-tree' : 'tree-branch'}>
      {label && <div className="tree-row group" style={{ paddingLeft: (depth - 1) * 16 }}><ChevronRight size={13} /><span className="tree-key">{label}</span><span className="tree-type">{Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`}</span></div>}
      {entries.slice(0, 1_500).map(([key, child]) => <ConfigTree key={`${depth}-${key}`} value={child} depth={depth + 1} label={key} />)}
      {entries.length > 1_500 && <div className="tree-truncated">还有 {entries.length - 1_500} 项未渲染</div>}
    </div>
  )
}

function formatScalar(value: string | number | boolean | null): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  return String(value)
}

function AnalysisPanel({ document }: { document: ConfigDocument }): React.JSX.Element {
  const { preferences } = useAppState()
  const [provider, setProvider] = useState<AiProviderPublicSettings | null>(null)
  const [record, setRecord] = useState<AiAnalysisRecord | null>(null)
  const [cacheLabel, setCacheLabel] = useState<'cached' | 'fresh' | 'refreshed' | null>(null)
  const [status, setStatus] = useState<'loading-cache' | 'idle' | 'analyzing' | 'complete' | 'error'>('loading-cache')
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let active = true
    setStatus('loading-cache')
    setRecord(null)
    setStale(false)
    void Promise.all([window.restx.ai.getProviderSettings(), window.restx.ai.getCachedAnalysis(document.path)])
      .then(([settings, cached]) => {
        if (!active) return
        setProvider(settings)
        setStale(cached.status === 'stale')
        if (cached.status === 'valid' && cached.record) {
          setRecord(cached.record)
          setCacheLabel('cached')
          setStatus('complete')
        } else setStatus('idle')
      })
      .catch((reason) => {
        if (!active) return
        setError(errorMessage(reason))
        setStatus('error')
      })
    return () => { active = false }
  }, [document.path, document.sourceHash])

  const analyze = async (force: boolean): Promise<void> => {
    setStatus('analyzing')
    setError('')
    try {
      const response: AiAnalysisResponse = await window.restx.ai.analyzeConfig({ path: document.path, force })
      setRecord(response)
      setCacheLabel(response.cacheStatus === 'hit' ? 'cached' : response.cacheStatus === 'refresh' ? 'refreshed' : 'fresh')
      setStale(false)
      setStatus('complete')
    } catch (reason) {
      setError(errorMessage(reason))
      setStatus('error')
    }
  }

  if (status === 'loading-cache') return <div className="analysis-state"><LoaderCircle className="spin" size={25} /><p>正在检查本地解析缓存…</p></div>
  if (!preferences?.aiLocalAnalysisEnabled) return <AnalysisPrerequisite title="尚未允许 AI 分析本地内容" description="RestX 只会发送经过脱敏的配置数据。请先在设置中明确开启授权。" />
  if (!provider?.model || !provider.apiKeyConfigured) return <AnalysisPrerequisite title="AI 服务尚未配置" description="设置一个 OpenAI-compatible Base URL、模型和 API Key 后即可解析。" />
  if (status === 'analyzing') return <div className="analysis-state"><LoaderCircle className="spin" size={28} /><h3>模型正在理解配置…</h3><p>发送内容已脱敏，请保持 RestX 运行。</p></div>
  if (status === 'error') return <div className="analysis-state error"><AlertTriangle size={28} /><h3>解析未完成</h3><p>{error}</p><button className="button secondary" onClick={() => void analyze(false)}>重试</button></div>
  if (status === 'complete' && record) return <AnalysisResult record={record} cacheLabel={cacheLabel} onRefresh={() => void analyze(true)} />

  return (
    <div className="analysis-empty">
      <div className="analysis-icon"><Bot size={26} /></div>
      <h3>{stale ? '配置已更新，需要重新解析' : '让 AI 帮你理解这份配置'}</h3>
      <p>模型将收到脱敏后的配置数据，并返回用途说明、风险提示和优化建议。</p>
      <div className="analysis-privacy"><ShieldCheck size={14} />{document.redactionCount} 个敏感值已脱敏 · 使用 {provider.model}</div>
      <button className="button primary" onClick={() => void analyze(false)}><Bot size={15} />{stale ? '重新解析配置' : '开始 AI 解析'}</button>
    </div>
  )
}

function AnalysisPrerequisite({ title, description }: { title: string; description: string }): React.JSX.Element {
  return <div className="analysis-state prerequisite"><Bot size={28} /><h3>{title}</h3><p>{description}</p><Link className="button secondary" to="/settings">前往设置</Link></div>
}

function AnalysisResult({ record, cacheLabel, onRefresh }: { record: AiAnalysisRecord; cacheLabel: string | null; onRefresh: () => void }): React.JSX.Element {
  const labels: Record<string, string> = { cached: '已使用缓存', fresh: '刚刚解析', refreshed: '已重新解析' }
  return (
    <div className="analysis-result">
      <div className="analysis-result-head"><div><span className="analysis-cache-badge"><CheckCircle2 size={13} />{cacheLabel ? labels[cacheLabel] : '解析完成'}</span><h3>{record.result.detectedTool ?? '配置解析结果'}</h3></div><button className="button compact" onClick={onRefresh}><RefreshCw size={13} />重新解析</button></div>
      <p className="analysis-summary">{record.result.summary}</p>
      {record.result.risks.length > 0 && <section className="analysis-section"><h4>风险提示</h4>{record.result.risks.map((risk, index) => <div className={`risk-card ${risk.severity}`} key={`${risk.title}-${index}`}><AlertTriangle size={15} /><div><strong>{risk.title}</strong><p>{risk.description}</p>{risk.path && <code>{risk.path}</code>}</div></div>)}</section>}
      {record.result.sections.map((section, index) => <section className="analysis-section" key={`${section.title}-${index}`}><h4>{section.title}</h4><div className="analysis-items">{section.items.map((item, itemIndex) => <div className="analysis-item" key={`${item.key}-${itemIndex}`}><code>{item.key}</code><span>{item.explanation}</span>{item.status && <i className={item.status}>{item.status === 'ok' ? '正常' : item.status === 'attention' ? '需注意' : '待确认'}</i>}</div>)}</div></section>)}
      {record.result.recommendations.length > 0 && <section className="analysis-section"><h4>建议</h4><ol className="recommendations">{record.result.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ol></section>}
      <div className="analysis-footer"><Clock3 size={13} />{formatDate(record.analyzedAt)} · {record.model}</div>
    </div>
  )
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '操作失败，请稍后重试。'
}
