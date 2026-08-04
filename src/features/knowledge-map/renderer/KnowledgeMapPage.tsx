import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Edit3, FolderOpen, RefreshCw, Save, X } from 'lucide-react'
import { PageHeader } from '../../../platform/renderer/components/PageHeader'
import type {
  ApplyKnowledgeClassificationInput,
  KnowledgeClassificationSuggestion,
  KnowledgeProblemDetail,
  KnowledgeScanResult,
  KnowledgeVirtualNode
} from '../shared/contracts'
import { buildKnowledgeLabelCatalog } from '../shared/knowledge-catalog'
import {
  buildDraftProblems,
  buildKnowledgeDraftGraph,
  buildKnowledgeEdits,
  countKnowledgeLabelReferences,
  createKnowledgeDraft,
  removeKnowledgeLabel,
  updateKnowledgeDraft,
  type KnowledgeDraft,
  type KnowledgeLabelKind
} from '../shared/knowledge-draft'
import { ClassificationDialog } from './components/ClassificationDialog'
import { KnowledgeLabelInspector, KnowledgeProblemEditor } from './components/KnowledgeEditInspector'
import { LayeredKnowledgeGraph } from './components/LayeredKnowledgeGraph'
import { ProblemInspector } from './components/ProblemInspector'
import './knowledge-map.css'

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : '操作失败，请稍后重试。'
}

export function KnowledgeMapPage(): React.JSX.Element {
  const [result, setResult] = useState<KnowledgeScanResult | null>(null)
  const [draft, setDraft] = useState<KnowledgeDraft | null>(null)
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<KnowledgeVirtualNode | null>(null)
  const [detail, setDetail] = useState<KnowledgeProblemDetail | null>(null)
  const [suggestion, setSuggestion] = useState<KnowledgeClassificationSuggestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [applying, setApplying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNotice(null)
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

  const editing = draft !== null
  const edits = useMemo(() => draft ? buildKnowledgeEdits(draft) : { edits: [] }, [draft])
  const dirty = edits.edits.length > 0
  const previewProblems = useMemo(
    () => result && draft ? buildDraftProblems(result.problems, draft) : result?.problems ?? [],
    [draft, result]
  )
  const previewGraph = useMemo(
    () => result && draft ? buildKnowledgeDraftGraph(result.problems, draft) : result?.graph ?? null,
    [draft, result]
  )
  const previewCatalog = useMemo(
    () => draft ? buildKnowledgeLabelCatalog(previewProblems) : result?.catalog ?? { scenes: [], capabilities: [], knowledge: [] },
    [draft, previewProblems, result]
  )
  const pending = useMemo(() => previewProblems.filter((problem) => problem.status !== 'organized'), [previewProblems])
  const selectedProblem = useMemo(
    () => previewProblems.find((problem) => problem.id === selectedProblemId) ?? null,
    [previewProblems, selectedProblemId]
  )

  useEffect(() => {
    if (!editing || !dirty) return
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    const interceptNavigation = (event: MouseEvent): void => {
      if (!(event.target instanceof Element) || !event.target.closest('a[href]')) return
      if (!window.confirm('有尚未保存的知识图谱修改，确定放弃并离开吗？')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', interceptNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', interceptNavigation, true)
    }
  }, [dirty, editing])

  const selectProblem = useCallback(async (problemId: string) => {
    setSelectedProblemId(problemId)
    setSelectedLabel(null)
    if (draft) {
      setDetail(null)
      return
    }
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
  }, [draft])

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

  function beginEditing(): void {
    if (!result) return
    setDraft(createKnowledgeDraft(result.problems))
    setSelectedLabel(null)
    setDetail(null)
    setError(null)
    setNotice(null)
  }

  function cancelEditing(): void {
    if (dirty && !window.confirm('确定放弃本次全部知识图谱修改吗？')) return
    setDraft(null)
    setSelectedLabel(null)
    setSelectedProblemId(null)
    setDetail(null)
    setError(null)
  }

  async function saveEditing(): Promise<void> {
    if (!draft || !edits.edits.length) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const next = await window.restx.knowledge.saveEdits(edits)
      setResult(next)
      setDraft(null)
      setSelectedLabel(null)
      setSelectedProblemId(null)
      setDetail(null)
      setNotice(`已保存 ${edits.edits.length} 个问题的关系修改。`)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  function selectLabel(node: KnowledgeVirtualNode): void {
    setSelectedLabel(node)
    setSelectedProblemId(null)
    setDetail(null)
  }

  function deleteLabel(kind: KnowledgeLabelKind, label: string): void {
    if (!draft) return
    const affected = countKnowledgeLabelReferences(draft, kind, label)
    if (!window.confirm(`删除标签“${label}”会影响 ${affected} 个问题，确定继续吗？`)) return
    setDraft(removeKnowledgeLabel(draft, kind, label))
    setSelectedLabel(null)
    setNotice(`已在草稿中删除标签“${label}”。`)
  }

  const headerActions = editing ? (
    <div className="knowledge-header-actions">
      <button className="button" type="button" disabled={saving} onClick={cancelEditing}><X size={15} />取消</button>
      <button className="button primary" type="button" disabled={!dirty || saving} onClick={() => void saveEditing()}><Save size={15} />{saving ? '保存中…' : `保存${dirty ? `（${edits.edits.length}）` : ''}`}</button>
    </div>
  ) : (
    <div className="knowledge-header-actions">
      <button className="button" type="button" onClick={() => void window.restx.knowledge.openRoot()}><FolderOpen size={15} />打开目录</button>
      <button className="button" type="button" disabled={loading || !result?.problems.length} onClick={beginEditing}><Edit3 size={15} />编辑</button>
      <button className="button primary" type="button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15} />刷新</button>
    </div>
  )

  return (
    <div className="page knowledge-page">
      <PageHeader
        eyebrow="LOCAL KNOWLEDGE"
        title="知识图谱"
        description={editing ? '编辑中的变化仅保存在草稿，点击保存后才会写入 Markdown。' : '从真实问题出发，把零散 Markdown 逐步整理为场景、能力和知识路径。'}
        actions={headerActions}
      />
      {editing && <div className="knowledge-edit-banner"><Edit3 size={15} />编辑模式 · 图谱正在预览草稿关系</div>}
      {error && <div className="knowledge-global-error" role="alert"><AlertCircle size={16} />{error}</div>}
      {notice && <div className="knowledge-global-notice" role="status">{notice}</div>}
      {loading && !result ? <div className="knowledge-loading">正在扫描 {`~/.restx/knowledge`}…</div> : null}
      {!loading && result && result.problems.length === 0 ? (
        <section className="knowledge-empty">
          <div className="knowledge-empty-icon"><FolderOpen size={27} /></div>
          <h2>知识目录还是空的</h2>
          <p>把零散的 Markdown 问题放入 {result.rootDisplayPath}，然后点击刷新。</p>
          <button className="button primary" type="button" onClick={() => void window.restx.knowledge.openRoot()}>打开知识目录</button>
        </section>
      ) : null}
      {result && result.problems.length > 0 && previewGraph ? (
        <>
          <section className="knowledge-summary">
            <div><strong>{previewProblems.length}</strong><span>问题文件</span></div>
            <div><strong>{previewGraph.scenes.length}</strong><span>场景</span></div>
            <div><strong>{previewGraph.capabilities.length}</strong><span>能力</span></div>
            <div><strong>{previewGraph.knowledge.length}</strong><span>知识</span></div>
            <code>{result.rootDisplayPath}</code>
          </section>
          <section className={`knowledge-workspace${editing ? ' editing' : ''}`}>
            <div className="knowledge-map-area">
              <div className="knowledge-section-title"><div><span>STRUCTURED MAP</span><h2>{editing ? '关系草稿预览' : '已整理路径'}</h2></div><small>场景 → 能力 → 知识 → 问题</small></div>
              {previewGraph.scenes.length
                ? <LayeredKnowledgeGraph
                    graph={previewGraph}
                    editing={editing}
                    selectedProblemId={selectedProblemId}
                    selectedLabelId={selectedLabel?.id}
                    onSelectProblem={(id) => void selectProblem(id)}
                    onSelectLabel={selectLabel}
                  />
                : <div className="knowledge-no-graph">{editing ? '为待整理问题补充完整分类后，路径会在这里预览。' : '完成第一个问题整理后，系统路径会显示在这里。'}</div>}
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
            {editing && draft && selectedProblem ? (
              <KnowledgeProblemEditor
                key={selectedProblem.id}
                problem={selectedProblem}
                classification={draft[selectedProblem.id]?.current ?? null}
                catalog={previewCatalog}
                onChange={(classification) => setDraft((current) => current ? updateKnowledgeDraft(current, selectedProblem.id, classification) : current)}
              />
            ) : editing && draft && selectedLabel ? (
              <KnowledgeLabelInspector
                node={selectedLabel}
                affectedCount={countKnowledgeLabelReferences(draft, selectedLabel.kind, selectedLabel.label)}
                onDelete={deleteLabel}
              />
            ) : editing ? (
              <aside className="knowledge-inspector"><div className="knowledge-placeholder"><span>选择一个节点</span><p>选择问题修改分类，或选择标签查看影响并执行全局删除。</p></div></aside>
            ) : (
              <ProblemInspector
                detail={detail}
                loading={detailLoading}
                classifying={classifying}
                onClassify={() => void classify()}
                onOpen={() => selectedProblemId && void window.restx.knowledge.open(selectedProblemId)}
              />
            )}
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
