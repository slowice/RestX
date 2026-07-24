import { useState } from 'react'
import { X } from 'lucide-react'
import type {
  ApplyKnowledgeClassificationInput,
  KnowledgeClassificationSuggestion,
  SuggestedLabel
} from '../../shared/contracts'

type Props = {
  suggestion: KnowledgeClassificationSuggestion
  applying: boolean
  error: string | null
  onCancel(): void
  onApply(input: ApplyKnowledgeClassificationInput): void
}

function splitLabels(value: string): string[] {
  return [...new Map(value
    .split(/[,\n，]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => [item.toLocaleLowerCase(), item])).values()]
}

function isValidLabel(value: string): boolean {
  return Boolean(value && value.length <= 80 && !/[\u0000-\u001f\u007f]/.test(value))
}

function LabelIndicators({ labels }: { labels: SuggestedLabel[] }): React.JSX.Element {
  return (
    <div className="knowledge-suggestion-labels">
      {labels.map((label) => <span key={label.value} className={label.existing ? 'existing' : 'new'}>{label.value}<em>{label.existing ? '复用已有' : '新增'}</em></span>)}
    </div>
  )
}

export function ClassificationDialog({ suggestion, applying, error, onCancel, onApply }: Props): React.JSX.Element {
  const [scene, setScene] = useState(suggestion.scene.value)
  const [capabilities, setCapabilities] = useState(suggestion.capabilities.map((item) => item.value).join('\n'))
  const [knowledge, setKnowledge] = useState(suggestion.knowledge.map((item) => item.value).join('\n'))
  const parsedCapabilities = splitLabels(capabilities)
  const parsedKnowledge = splitLabels(knowledge)
  const normalizedScene = scene.trim()
  const valid = isValidLabel(normalizedScene)
    && parsedCapabilities.length >= 1
    && parsedCapabilities.length <= 8
    && parsedCapabilities.every(isValidLabel)
    && parsedKnowledge.length >= 1
    && parsedKnowledge.length <= 8
    && parsedKnowledge.every(isValidLabel)
  return (
    <div className="knowledge-dialog-backdrop">
      <section className="knowledge-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-dialog-title">
        <div className="knowledge-dialog-header">
          <div><span>AI SUGGESTION</span><h2 id="knowledge-dialog-title">确认 AI 整理结果</h2></div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onCancel}><X size={16} /></button>
        </div>
        <p className="knowledge-dialog-note">AI 只提供建议。确认后仅更新 Frontmatter，并在写回前保存原文件备份。</p>
        <label>主要场景<input value={scene} onChange={(event) => setScene(event.target.value)} /></label>
        <LabelIndicators labels={[suggestion.scene]} />
        <label>能力标签<textarea aria-label="能力标签" rows={4} value={capabilities} onChange={(event) => setCapabilities(event.target.value)} /></label>
        <LabelIndicators labels={suggestion.capabilities} />
        <label>知识标签<textarea aria-label="知识标签" rows={4} value={knowledge} onChange={(event) => setKnowledge(event.target.value)} /></label>
        <LabelIndicators labels={suggestion.knowledge} />
        {error && <div className="knowledge-inline-error">{error}</div>}
        <div className="knowledge-dialog-actions">
          <button className="button" type="button" onClick={onCancel}>取消</button>
          <button
            className="button primary"
            type="button"
            disabled={!valid || applying}
            onClick={() => onApply({
              problemId: suggestion.problemId,
              sourceFingerprint: suggestion.sourceFingerprint,
              scene: normalizedScene,
              capabilities: parsedCapabilities,
              knowledge: parsedKnowledge
            })}
          >
            {applying ? '正在写回…' : '确认并写回'}
          </button>
        </div>
      </section>
    </div>
  )
}
