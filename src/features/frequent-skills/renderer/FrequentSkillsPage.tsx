import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Clipboard,
  FileUp,
  LoaderCircle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  WandSparkles,
  X
} from 'lucide-react'
import { PageHeader } from '../../../platform/renderer/components/PageHeader'
import {
  MAX_SKILL_DESCRIPTION_CHARS,
  MAX_SKILL_NAME_CHARS,
  MAX_SKILL_PROMPT_CHARS,
  type FrequentSkill,
  type FrequentSkillDraft,
  type FrequentSkillExecutionResult,
  type FrequentSkillsResult
} from '../shared/contracts'
import './frequent-skills.css'

type Notice = { kind: 'success' | 'error'; text: string }
type EditorState = FrequentSkillDraft & { mode: 'create' | 'edit'; id?: string }
type ExecutionState =
  | { status: 'idle' }
  | { status: 'running'; skillName: string }
  | { status: 'success'; result: FrequentSkillExecutionResult }
  | { status: 'error'; skillName: string; message: string }

const EMPTY_DRAFT: FrequentSkillDraft = { name: '', description: '', prompt: '' }

function unwrap<T>(result: FrequentSkillsResult<T>): T {
  if (result.ok) return result.data
  throw new Error(result.error.message)
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error
    ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
    : '操作失败，请稍后重试。'
}

function validateDraft(draft: FrequentSkillDraft): string | null {
  if (!draft.name.trim()) return '请输入 Skill 名称。'
  if (draft.name.trim().length > MAX_SKILL_NAME_CHARS) return `Skill 名称不能超过 ${MAX_SKILL_NAME_CHARS} 个字符。`
  if (draft.description.trim().length > MAX_SKILL_DESCRIPTION_CHARS) return `说明不能超过 ${MAX_SKILL_DESCRIPTION_CHARS} 个字符。`
  if (!draft.prompt.trim()) return '请输入固定提示词。'
  if (draft.prompt.trim().length > MAX_SKILL_PROMPT_CHARS) return `提示词不能超过 ${MAX_SKILL_PROMPT_CHARS} 个字符。`
  return null
}

export function FrequentSkillsPage(): React.JSX.Element {
  const [skills, setSkills] = useState<FrequentSkill[]>([])
  const [invalidCount, setInvalidCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [execution, setExecution] = useState<ExecutionState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)

  const loadSkills = useCallback(async (): Promise<void> => {
    const list = unwrap(await window.restx.frequentSkills.list())
    setSkills(list.skills)
    setInvalidCount(list.invalidCount)
  }, [])

  useEffect(() => {
    void loadSkills()
      .catch((reason) => setNotice({ kind: 'error', text: errorMessage(reason) }))
      .finally(() => setLoading(false))
  }, [loadSkills])

  const openCreate = (): void => {
    setEditor({ mode: 'create', ...EMPTY_DRAFT })
    setEditorError(null)
  }

  const openEdit = (skill: FrequentSkill): void => {
    setEditor({ mode: 'edit', id: skill.id, name: skill.name, description: skill.description, prompt: skill.prompt })
    setEditorError(null)
  }

  const saveEditor = async (): Promise<void> => {
    if (!editor) return
    const validation = validateDraft(editor)
    if (validation) {
      setEditorError(validation)
      return
    }
    setBusy(true)
    setEditorError(null)
    try {
      const draft = { name: editor.name, description: editor.description, prompt: editor.prompt }
      const saved = editor.mode === 'create'
        ? unwrap(await window.restx.frequentSkills.create(draft))
        : unwrap(await window.restx.frequentSkills.update({ id: editor.id!, ...draft }))
      await loadSkills()
      setEditor(null)
      setNotice({ kind: 'success', text: `Skill“${saved.name}”已${editor.mode === 'create' ? '新增' : '保存'}。` })
    } catch (reason) {
      setEditorError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  const importSkill = async (): Promise<void> => {
    setBusy(true)
    setImporting(true)
    setNotice(null)
    try {
      const imported = unwrap(await window.restx.frequentSkills.importSkill())
      if (imported.cancelled) return
      await loadSkills()
      const skillName = imported.skill?.name ?? ''
      const analysis = imported.analysis
      const text = analysis?.method === 'direct'
        ? `Skill“${skillName}”是标准 RestX Skill，已直接导入。`
        : analysis?.method === 'ai'
          ? `已智能识别${analysis.detectedFormat ? `为 ${analysis.detectedFormat}` : '文件结构'}并导入 Skill“${skillName}”。`
          : `智能分析未完成，已保留原始内容导入 Skill“${skillName}”；如有需要可编辑名称和说明。`
      setNotice({ kind: 'success', text })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setImporting(false)
      setBusy(false)
    }
  }

  const deleteSkill = async (skill: FrequentSkill): Promise<void> => {
    if (!window.confirm(`确定删除 Skill“${skill.name}”吗？\n该目录会被移入系统废纸篓。`)) return
    setDeletingId(skill.id)
    setNotice(null)
    try {
      unwrap(await window.restx.frequentSkills.delete(skill.id))
      await loadSkills()
      setNotice({ kind: 'success', text: `Skill“${skill.name}”已移入废纸篓。` })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setDeletingId(null)
    }
  }

  const executeSkill = async (skill: FrequentSkill): Promise<void> => {
    setExecutingId(skill.id)
    setCopied(false)
    setNotice(null)
    setExecution({ status: 'running', skillName: skill.name })
    try {
      const result = unwrap(await window.restx.frequentSkills.execute(skill.id))
      setExecution({ status: 'success', result })
    } catch (reason) {
      setExecution({ status: 'error', skillName: skill.name, message: errorMessage(reason) })
    } finally {
      setExecutingId(null)
    }
  }

  const copyResult = async (): Promise<void> => {
    if (execution.status !== 'success') return
    try {
      await navigator.clipboard.writeText(execution.result.text)
      setCopied(true)
    } catch {
      setNotice({ kind: 'error', text: '无法复制结果，请手动选择文本。' })
    }
  }

  return (
    <div className="page frequent-skills-page">
      <PageHeader
        eyebrow="RESTX AI SKILLS"
        title="常用技能"
        description="把经常使用的提示词保存为本地 Skill，通过当前启用的 AI Provider 一键执行。"
        actions={<div className="frequent-skills-header-actions"><button className="button" disabled={busy} onClick={() => void importSkill()}>{importing ? <LoaderCircle className="spin" size={15} /> : <FileUp size={15} />}{importing ? '正在智能导入…' : '智能导入 Skill'}</button><button className="button primary" disabled={busy} onClick={openCreate}><Plus size={15} />新增 Skill</button></div>}
      />

      {notice && <div className={`frequent-skills-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.kind === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}<span>{notice.text}</span></div>}
      {invalidCount > 0 && <div className="frequent-skills-notice warning" role="alert"><AlertCircle size={15} /><span>发现 {invalidCount} 个无效的 Skill 目录或文件，已安全跳过。</span></div>}

      <div className="frequent-skills-workspace">
        <section className="frequent-skills-library" aria-label="Skill 列表">
          <div className="frequent-skills-section-heading"><span>我的 Skills</span><small>{skills.length} 个</small></div>
          <div className="frequent-skills-list">
            {loading && <div className="frequent-skills-empty"><LoaderCircle className="spin" size={24} /><span>正在读取 Skills…</span></div>}
            {!loading && skills.map((skill) => (
              <article className="frequent-skill-row" key={skill.id}>
                <div className="frequent-skill-icon"><WandSparkles size={17} /></div>
                <div className="frequent-skill-summary"><strong>{skill.name}</strong><span>{skill.description || '暂无说明'}</span><small>更新于 {new Date(skill.updatedAt).toLocaleString()}</small></div>
                <div className="frequent-skill-actions">
                  <button className="button compact" disabled={busy || deletingId === skill.id} onClick={() => openEdit(skill)}><Pencil size={13} />编辑</button>
                  <button className="button compact danger" disabled={busy || deletingId === skill.id || executingId !== null} onClick={() => void deleteSkill(skill)}>{deletingId === skill.id ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />}删除</button>
                  <button className="button compact primary" disabled={busy || deletingId !== null || executingId !== null} onClick={() => void executeSkill(skill)}>{executingId === skill.id ? <LoaderCircle className="spin" size={13} /> : <Sparkles size={13} />}{executingId === skill.id ? '执行中…' : '执行'}</button>
                </div>
              </article>
            ))}
            {!loading && skills.length === 0 && <div className="frequent-skills-empty"><WandSparkles size={27} /><strong>还没有常用技能</strong><span>新增一个固定提示词，或智能导入已有 Markdown Skill。</span><div><button className="button compact" onClick={() => void importSkill()}><FileUp size={13} />智能导入</button><button className="button compact primary" onClick={openCreate}><Plus size={13} />新增</button></div></div>}
          </div>
          <div className="frequent-skills-storage-note"><Clipboard size={14} /><span>Skills 保存在 ~/.restx/skills；非 RestX 格式的源内容可能发送给当前 AI Provider，仅用于分析名称、说明和格式。</span></div>
        </section>

        <section className="frequent-skills-result" aria-label="最近执行结果">
          <div className="frequent-skills-section-heading"><span>最近执行结果</span>{execution.status === 'success' && <button className="copy-result" onClick={() => void copyResult()}><Clipboard size={13} />{copied ? '已复制' : '复制'}</button>}</div>
          <div className="frequent-skills-result-body">
            {execution.status === 'idle' && <div className="result-placeholder"><Sparkles size={28} /><strong>等待执行</strong><span>点击任一 Skill 右侧的“执行”，结果会显示在这里。</span></div>}
            {execution.status === 'running' && <div className="result-placeholder"><LoaderCircle className="spin" size={28} /><strong>正在执行“{execution.skillName}”</strong><span>正在等待当前 AI Provider 返回文本结果…</span></div>}
            {execution.status === 'error' && <div className="result-error" role="alert"><AlertCircle size={21} /><div><strong>“{execution.skillName}”执行失败</strong><span>{execution.message}</span></div></div>}
            {execution.status === 'success' && <div className="result-success"><div><Sparkles size={15} /><strong>{execution.result.skillName}</strong><time>{new Date(execution.result.completedAt).toLocaleString()}</time></div><pre>{execution.result.text}</pre></div>}
          </div>
          <div className="frequent-skills-result-note"><strong>文本执行</strong><span>此功能不会调用终端、工具或文件系统。</span></div>
        </section>
      </div>

      {editor && <div className="frequent-skill-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditor(null) }}><section className="frequent-skill-modal" role="dialog" aria-modal="true" aria-labelledby="frequent-skill-editor-title"><div className="frequent-skill-modal-header"><div><small>{editor.mode === 'create' ? 'NEW SKILL' : 'EDIT SKILL'}</small><h2 id="frequent-skill-editor-title">{editor.mode === 'create' ? '新增 Skill' : '编辑 Skill'}</h2></div><button className="modal-close" disabled={busy} aria-label="关闭" onClick={() => setEditor(null)}><X size={17} /></button></div><div className="frequent-skill-form"><label><span>名称</span><input autoFocus maxLength={MAX_SKILL_NAME_CHARS} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="例如：整理会议纪要" /></label><label><span>说明 <small>可选</small></span><input maxLength={MAX_SKILL_DESCRIPTION_CHARS} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} placeholder="简单说明这个 Skill 的用途" /></label><label><span>固定提示词</span><textarea maxLength={MAX_SKILL_PROMPT_CHARS} rows={12} value={editor.prompt} onChange={(event) => setEditor({ ...editor, prompt: event.target.value })} placeholder="输入每次点击执行时发送给 AI 的完整提示词" /></label>{editorError && <div className="frequent-skill-form-error" role="alert"><AlertCircle size={14} />{editorError}</div>}</div><div className="frequent-skill-modal-actions"><button className="button" disabled={busy} onClick={() => setEditor(null)}>取消</button><button className="button primary" disabled={busy} onClick={() => void saveEditor()}>{busy && <LoaderCircle className="spin" size={14} />}{busy ? '保存中…' : '保存 Skill'}</button></div></section></div>}
    </div>
  )
}
