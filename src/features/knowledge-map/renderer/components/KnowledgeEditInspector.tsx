import { AlertCircle, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type {
  KnowledgeEditableClassification,
  KnowledgeLabelCatalog,
  KnowledgeProblemSummary,
  KnowledgeVirtualNode
} from '../../shared/contracts'
import type { KnowledgeLabelKind } from '../../shared/knowledge-draft'

type ProblemEditorProps = {
  problem: KnowledgeProblemSummary
  classification: KnowledgeEditableClassification | null
  catalog: KnowledgeLabelCatalog
  onChange(classification: KnowledgeEditableClassification | null): void
}

type LabelInspectorProps = {
  node: KnowledgeVirtualNode
  affectedCount: number
  onDelete(kind: KnowledgeLabelKind, label: string): void
}

function classificationOrEmpty(value: KnowledgeEditableClassification | null): KnowledgeEditableClassification {
  return value ?? { scene: null, capabilities: [], knowledge: [] }
}

function MultiLabelEditor({
  title,
  kind,
  values,
  suggestions,
  onChange
}: {
  title: string
  kind: 'capability' | 'knowledge'
  values: string[]
  suggestions: string[]
  onChange(values: string[]): void
}): React.JSX.Element {
  const [input, setInput] = useState('')
  const listId = `knowledge-${kind}-suggestions`

  function add(): void {
    const value = input.trim()
    if (!value || values.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) return
    onChange([...values, value])
    setInput('')
  }

  return (
    <fieldset className="knowledge-edit-field">
      <legend>{title}</legend>
      <div className="knowledge-edit-chips">
        {values.map((value) => (
          <span key={value.toLocaleLowerCase()}>{value}<button type="button" aria-label={`移除${title} ${value}`} onClick={() => onChange(values.filter((item) => item !== value))}><X size={12} /></button></span>
        ))}
        {!values.length && <small>尚未添加</small>}
      </div>
      <div className="knowledge-edit-add">
        <input
          aria-label={`新增${title}`}
          list={listId}
          value={input}
          maxLength={80}
          placeholder={`复用或新建${title}`}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
        <datalist id={listId}>{suggestions.map((value) => <option key={value} value={value} />)}</datalist>
        <button className="icon-button" type="button" aria-label={`添加${title}`} disabled={!input.trim() || values.length >= 8} onClick={add}><Plus size={15} /></button>
      </div>
    </fieldset>
  )
}

export function KnowledgeProblemEditor({ problem, classification, catalog, onChange }: ProblemEditorProps): React.JSX.Element {
  if (problem.status === 'invalid') {
    return (
      <aside className="knowledge-inspector">
        <div className="knowledge-inline-error"><AlertCircle size={15} />请先在外部编辑器修复 Frontmatter，再编辑关系。</div>
      </aside>
    )
  }
  const value = classificationOrEmpty(classification)
  return (
    <aside className="knowledge-inspector knowledge-edit-inspector">
      <div className="knowledge-inspector-header">
        <div><span className="knowledge-status editing">编辑问题</span><h2>{problem.title}</h2><code>{problem.id}</code></div>
      </div>
      <label className="knowledge-edit-field knowledge-scene-field">
        <span>场景</span>
        <input
          aria-label="场景标签"
          list="knowledge-scene-suggestions"
          maxLength={80}
          placeholder="选择或输入一个场景"
          value={value.scene ?? ''}
          onChange={(event) => onChange({ ...value, scene: event.target.value || null })}
        />
        <datalist id="knowledge-scene-suggestions">{catalog.scenes.map((label) => <option key={label} value={label} />)}</datalist>
      </label>
      <MultiLabelEditor title="能力" kind="capability" values={value.capabilities} suggestions={catalog.capabilities} onChange={(capabilities) => onChange({ ...value, capabilities })} />
      <MultiLabelEditor title="知识" kind="knowledge" values={value.knowledge} suggestions={catalog.knowledge} onChange={(knowledge) => onChange({ ...value, knowledge })} />
      <div className="knowledge-edit-status">
        {value.scene && value.capabilities.length && value.knowledge.length
          ? '分类完整，保存后进入已整理路径。'
          : '分类尚不完整，保存后保留在待整理区域。'}
      </div>
      <button className="button danger knowledge-semantic-remove" type="button" disabled={classification === null} onClick={() => onChange(null)}><Trash2 size={15} />移回待整理</button>
    </aside>
  )
}

export function KnowledgeLabelInspector({ node, affectedCount, onDelete }: LabelInspectorProps): React.JSX.Element {
  const kindLabel = node.kind === 'scene' ? '场景' : node.kind === 'capability' ? '能力' : '知识'
  return (
    <aside className="knowledge-inspector knowledge-edit-inspector">
      <div className="knowledge-inspector-header">
        <div><span className="knowledge-status editing">{kindLabel}标签</span><h2>{node.label}</h2></div>
      </div>
      <div className="knowledge-label-impact"><strong>{affectedCount}</strong><span>个问题正在引用此标签</span></div>
      <p className="knowledge-dialog-note">删除会从所有引用问题中移除此标签。分类不再完整的问题将回到待整理区域，Markdown 文件不会被删除。</p>
      <button className="button danger knowledge-semantic-remove" type="button" onClick={() => onDelete(node.kind, node.label)}><Trash2 size={15} />删除此标签</button>
    </aside>
  )
}
