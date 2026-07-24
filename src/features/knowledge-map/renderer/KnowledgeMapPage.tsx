import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, FolderOpen, RefreshCw } from 'lucide-react'
import { PageHeader } from '../../../platform/renderer/components/PageHeader'
import type {
  ApplyKnowledgeClassificationInput,
  KnowledgeClassificationSuggestion,
  KnowledgeProblemDetail,
  KnowledgeScanResult
} from '../shared/contracts'
import { ClassificationDialog } from './components/ClassificationDialog'
import { LayeredKnowledgeGraph } from './components/LayeredKnowledgeGraph'
import { ProblemInspector } from './components/ProblemInspector'
import './knowledge-map.css'

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : '操作失败，请稍后重试。'
}

export function KnowledgeMapPage(): React.JSX.Element {
  const [result, setResult] = useState<KnowledgeScanResult | null>(null)
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [detail, setDetail] = useState<KnowledgeProblemDetail | null>(null)
  const [suggestion, setSuggestion] = useState<KnowledgeClassificationSuggestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await window.restx.knowledge.scan()
      setResult(next)
      setSelectedProblemId((current) => {
        if (!current || next.problems.some((problem) => problem.id === current)) return current
        setDetail(null)
        return null
      })
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const selectProblem = useCallback(async (problemId: string) => {
    setSelectedProblemId(problemId)
    setDetail(null)
    setDetailLoading(true)
    setError(null)
    try {
      setDetail(await window.restx.knowledge.read(problemId))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const pending = useMemo(() => result?.problems.filter((problem) => problem.status !== 'organized') ?? [], [result])

  async function classify(): Promise<void> {
    if (!selectedProblemId) return
    setClassifying(true)
    setError(null)
    try {
      setSuggestion(await window.restx.knowledge.classify(selectedProblemId))
      setDialogError(null)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setClassifying(false)
    }
  }

  async function apply(input: ApplyKnowledgeClassificationInput): Promise<void> {
    setApplying(true)
    setDialogError(null)
    try {
      const next = await window.restx.knowledge.apply(input)
      setResult(next)
      setSuggestion(null)
      setSelectedProblemId(null)
      setDetail(null)
    } catch (reason) {
      setDialogError(errorMessage(reason))
    } finally {
      setApplying(false)
    }
  }

  const headerActions = (
    <div className="knowledge-header-actions">
      <button className="button" type="button" onClick={() => void window.restx.knowledge.openRoot()}><FolderOpen size={15} />打开目录</button>
      <button className="button primary" type="button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15} />刷新</button>
    </div>
  )

  return (
    <div className="page knowledge-page">
      <PageHeader
        eyebrow="LOCAL KNOWLEDGE"
        title="知识图谱"
        description="从真实问题出发，把零散 Markdown 逐步整理为场景、能力和知识路径。"
        actions={headerActions}
      />
      {error && <div className="knowledge-global-error" role="alert"><AlertCircle size={16} />{error}</div>}
      {loading && !result ? <div className="knowledge-loading">正在扫描 {`~/.restx/knowledge`}…</div> : null}
      {!loading && result && result.problems.length === 0 ? (
        <section className="knowledge-empty">
          <div className="knowledge-empty-icon"><FolderOpen size={27} /></div>
          <h2>知识目录还是空的</h2>
          <p>把零散的 Markdown 问题放入 {result.rootDisplayPath}，然后点击刷新。</p>
          <button className="button primary" type="button" onClick={() => void window.restx.knowledge.openRoot()}>打开知识目录</button>
        </section>
      ) : null}
      {result && result.problems.length > 0 ? (
        <>
          <section className="knowledge-summary">
            <div><strong>{result.problems.length}</strong><span>问题文件</span></div>
            <div><strong>{result.graph.scenes.length}</strong><span>场景</span></div>
            <div><strong>{result.graph.capabilities.length}</strong><span>能力</span></div>
            <div><strong>{result.graph.knowledge.length}</strong><span>知识</span></div>
            <code>{result.rootDisplayPath}</code>
          </section>
          <section className="knowledge-workspace">
            <div className="knowledge-map-area">
              <div className="knowledge-section-title"><div><span>STRUCTURED MAP</span><h2>已整理路径</h2></div><small>场景 → 能力 → 知识 → 问题</small></div>
              {result.graph.scenes.length
                ? <LayeredKnowledgeGraph graph={result.graph} selectedProblemId={selectedProblemId} onSelectProblem={(id) => void selectProblem(id)} />
                : <div className="knowledge-no-graph">完成第一个问题整理后，系统路径会显示在这里。</div>}
              <div className="knowledge-pending">
                <div className="knowledge-section-title"><div><span>INBOX</span><h2>待整理</h2></div><small>{pending.length} 个问题</small></div>
                <div className="knowledge-pending-list">
                  {pending.length ? pending.map((problem) => (
                    <button
                      key={problem.id}
                      type="button"
                      className={problem.id === selectedProblemId ? 'selected' : ''}
                      aria-label={`${problem.status === 'invalid' ? '格式异常' : '待整理'} ${problem.title}`}
                      onClick={() => void selectProblem(problem.id)}
                    >
                      <span>{problem.status === 'invalid' ? '格式异常' : '待整理'}</span>
                      <strong>{problem.title}</strong>
                      <code>{problem.id}</code>
                    </button>
                  )) : <p>所有问题都已整理。</p>}
                </div>
              </div>
            </div>
            <ProblemInspector
              detail={detail}
              loading={detailLoading}
              classifying={classifying}
              onClassify={() => void classify()}
              onOpen={() => selectedProblemId && void window.restx.knowledge.open(selectedProblemId)}
            />
          </section>
        </>
      ) : null}
      {suggestion && (
        <ClassificationDialog
          suggestion={suggestion}
          applying={applying}
          error={dialogError}
          onCancel={() => setSuggestion(null)}
          onApply={(input) => void apply(input)}
        />
      )}
    </div>
  )
}
