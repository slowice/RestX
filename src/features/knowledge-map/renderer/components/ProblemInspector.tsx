import { AlertCircle, ExternalLink, Sparkles } from 'lucide-react'
import type { KnowledgeProblemDetail } from '../../shared/contracts'

type Props = {
  detail: KnowledgeProblemDetail | null
  loading: boolean
  classifying: boolean
  onClassify(): void
  onOpen(): void
}

function MarkdownPreview({ markdown }: { markdown: string }): React.JSX.Element {
  const blocks = markdown.split(/\n{2,}/).filter(Boolean)
  return (
    <div className="knowledge-markdown">
      {blocks.map((block, index) => {
        const heading = block.match(/^#{1,3}\s+(.+)$/)
        if (heading) return <h3 key={index}>{heading[1]}</h3>
        return <p key={index}>{block}</p>
      })}
    </div>
  )
}

export function ProblemInspector({ detail, loading, classifying, onClassify, onOpen }: Props): React.JSX.Element {
  if (loading) return <aside className="knowledge-inspector"><div className="knowledge-placeholder">正在读取问题…</div></aside>
  if (!detail) {
    return (
      <aside className="knowledge-inspector">
        <div className="knowledge-placeholder">
          <span>选择一个问题</span>
          <p>查看 Markdown 内容，或让 AI 建议场景、能力和知识标签。</p>
        </div>
      </aside>
    )
  }
  return (
    <aside className="knowledge-inspector">
      <div className="knowledge-inspector-header">
        <div>
          <span className={`knowledge-status ${detail.status}`}>{detail.status === 'organized' ? '已整理' : detail.status === 'invalid' ? '格式异常' : '待整理'}</span>
          <h2>{detail.title}</h2>
          <code>{detail.id}</code>
        </div>
        <button className="icon-button" type="button" aria-label="使用系统默认应用打开" onClick={onOpen}><ExternalLink size={16} /></button>
      </div>
      {detail.issue && <div className="knowledge-inline-error"><AlertCircle size={15} />{detail.issue}</div>}
      {detail.labels && (
        <div className="knowledge-label-summary">
          <div><span>场景</span><strong>{detail.labels.scene}</strong></div>
          <div><span>能力</span><p>{detail.labels.capabilities.join(' · ')}</p></div>
          <div><span>知识</span><p>{detail.labels.knowledge.join(' · ')}</p></div>
        </div>
      )}
      <button className="button primary knowledge-ai-button" type="button" disabled={detail.status === 'invalid' || classifying} onClick={onClassify}>
        <Sparkles size={15} />{classifying ? 'AI 正在整理…' : 'AI 整理'}
      </button>
      <div className="knowledge-preview-title"><span>MARKDOWN PREVIEW</span><small>{Math.round(detail.sizeBytes / 1024 * 10) / 10} KB</small></div>
      <MarkdownPreview markdown={detail.markdown} />
    </aside>
  )
}

