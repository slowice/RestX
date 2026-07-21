import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, Check, ChevronRight, FileJson2, FolderOpen, LoaderCircle, Power, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import type { SmartPresetDraft, UserPresetSummary } from '../../../../shared/contracts/smart-import'

export function SmartImportDialog({ initialRootPath, onClose, onImported }: {
  initialRootPath: string | null
  onClose: () => void
  onImported: (rootPath: string) => Promise<void>
}): React.JSX.Element {
  const [toolName, setToolName] = useState('')
  const [rootPath, setRootPath] = useState(initialRootPath ?? '')
  const [knownPaths, setKnownPaths] = useState('')
  const [notes, setNotes] = useState('')
  const [consent, setConsent] = useState(false)
  const [draft, setDraft] = useState<SmartPresetDraft | null>(null)
  const [presets, setPresets] = useState<UserPresetSummary[]>([])
  const [status, setStatus] = useState<'idle' | 'generating' | 'saving'>('idle')
  const [error, setError] = useState('')

  const refreshPresets = async (): Promise<void> => setPresets(await window.restx.presets.list())
  useEffect(() => { void refreshPresets().catch((reason) => setError(errorMessage(reason))) }, [])

  const chooseRoot = async (): Promise<void> => {
    const selected = await window.restx.inspector.chooseDirectory()
    if (selected) setRootPath(selected)
  }

  const generate = async (): Promise<void> => {
    if (!toolName.trim() || !rootPath || !consent) return
    setStatus('generating')
    setError('')
    setDraft(null)
    try {
      setDraft(await window.restx.presets.generateDraft({ toolName, rootPath, knownPaths, notes, metadataConsent: consent }))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setStatus('idle')
    }
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    setStatus('saving')
    setError('')
    try {
      await window.restx.presets.save({ preset: draft.preset })
      await refreshPresets()
      onClose()
      await onImported(rootPath)
    } catch (reason) {
      setError(errorMessage(reason))
      setStatus('idle')
    }
  }

  const togglePreset = async (preset: UserPresetSummary): Promise<void> => {
    try { setPresets(await window.restx.presets.setEnabled(preset.id, !preset.enabled)) } catch (reason) { setError(errorMessage(reason)) }
  }

  const deletePreset = async (preset: UserPresetSummary): Promise<void> => {
    if (!window.confirm(`删除用户预置“${preset.displayName}”？这不会删除该 AI 工具的任何数据。`)) return
    try { setPresets(await window.restx.presets.delete(preset.id)) } catch (reason) { setError(errorMessage(reason)) }
  }

  return (
    <div className="smart-import-backdrop" role="presentation">
      <section className="smart-import-dialog" role="dialog" aria-modal="true" aria-label="智能导入 AI 工具">
        <header className="smart-import-header">
          <span className="smart-import-icon"><Sparkles size={20} /></span>
          <div><span>SMART IMPORT</span><h2>智能导入 AI 工具</h2><p>让模型根据目录元数据生成安全的声明式预置。</p></div>
          <button className="icon-button" onClick={onClose} title="关闭"><X size={17} /></button>
        </header>

        {error && <div className="smart-import-error"><AlertTriangle size={14} />{error}</div>}

        {!draft ? (
          <div className="smart-import-content">
            <div className="smart-import-form">
              <label><span>工具名称 <b>必填</b></span><input value={toolName} onChange={(event) => setToolName(event.target.value)} placeholder="例如 Gemini CLI、Aider" /></label>
              <label><span>扫描根目录 <b>必填</b></span><div className="path-picker"><input readOnly value={rootPath} placeholder="选择用户目录或工具数据目录" /><button className="button secondary compact" onClick={() => void chooseRoot()}><FolderOpen size={14} />选择</button></div></label>
              <label><span>可能的路径 <i>可选</i></span><textarea value={knownPaths} onChange={(event) => setKnownPaths(event.target.value)} placeholder={'例如 ~/.gemini\n.config/gemini\n每行一个，不确定可留空'} /></label>
              <label><span>其他线索 <i>可选</i></span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如官网、安装方式、你见过的文件名或日志格式" /></label>
              <label className="metadata-consent">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span><ShieldCheck size={16} /><span><strong>允许向已配置的 AI 服务发送目录元数据</strong><small>仅包含相对路径、类型、大小和修改时间；不读取或发送文件内容。</small></span></span>
              </label>
              <button className="button primary smart-generate" disabled={!toolName.trim() || !rootPath || !consent || status === 'generating'} onClick={() => void generate()}>
                {status === 'generating' ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{status === 'generating' ? '正在分析目录并生成预置…' : '生成导入方案'}
              </button>
            </div>

            <ImportedPresetList presets={presets} onToggle={togglePreset} onDelete={deletePreset} />
          </div>
        ) : (
          <PresetPreview draft={draft} saving={status === 'saving'} onBack={() => setDraft(null)} onSave={save} />
        )}
      </section>
    </div>
  )
}

function ImportedPresetList({ presets, onToggle, onDelete }: {
  presets: UserPresetSummary[]
  onToggle: (preset: UserPresetSummary) => Promise<void>
  onDelete: (preset: UserPresetSummary) => Promise<void>
}): React.JSX.Element {
  return (
    <section className="imported-presets">
      <div className="imported-heading"><div><strong>已导入预置</strong><span>保存在 ~/.RestX/presets/</span></div><b>{presets.filter((item) => item.valid).length}</b></div>
      {presets.length === 0 ? <div className="imported-empty"><Bot size={20} />还没有用户预置</div> : presets.map((preset) => (
        <article key={preset.filePath} className={`imported-preset${preset.valid ? '' : ' invalid'}`}>
          <span className="imported-preset-icon"><FileJson2 size={16} /></span>
          <div><strong>{preset.displayName}</strong><small>{preset.valid ? `${preset.id} · ${preset.format.toUpperCase()}` : preset.error}</small></div>
          {preset.valid && <button className={`preset-power${preset.enabled ? ' on' : ''}`} title={preset.enabled ? '停用' : '启用'} onClick={() => void onToggle(preset)}><Power size={14} /></button>}
          <button className="icon-button danger-icon" title="删除" onClick={() => void onDelete(preset)}><Trash2 size={14} /></button>
        </article>
      ))}
    </section>
  )
}

function PresetPreview({ draft, saving, onBack, onSave }: { draft: SmartPresetDraft; saving: boolean; onBack: () => void; onSave: () => Promise<void> }): React.JSX.Element {
  const counts = draft.trial.tool.counts
  const ruleCount = useMemo(() => draft.preset.sources.reduce((sum, source) => sum + source.patterns.length, 0), [draft])
  return (
    <div className="preset-preview">
      <div className={`trial-banner ${draft.trial.detected ? 'detected' : 'uncertain'}`}>
        {draft.trial.detected ? <Check size={18} /> : <AlertTriangle size={18} />}
        <div><strong>{draft.trial.detected ? '试扫描已检测到该工具' : '试扫描未命中探针'}</strong><span>{draft.trial.detected ? `匹配 ${draft.trial.candidates.length} 个文件` : '可以返回补充路径线索，或仍然保存供其他机器使用。'}</span></div>
      </div>

      <div className="preset-preview-grid">
        <section>
          <div className="preview-title"><span><Bot size={15} />预置概览</span><b>{draft.preset.id}</b></div>
          <p className="preset-explanation">{draft.explanation}</p>
          <div className="preset-stat-grid">
            <div><strong>{draft.preset.probes.length}</strong><span>检测探针</span></div><div><strong>{draft.preset.sources.length}</strong><span>数据来源</span></div><div><strong>{ruleCount}</strong><span>匹配规则</span></div><div><strong>{draft.inventory.entryCount}</strong><span>检查元数据</span></div>
          </div>
          <div className="trial-counts"><span>{counts.config} 配置</span><span>{counts.instruction} 指令</span><span>{counts.conversation} 会话</span><span>{counts.history} 历史</span><span>{counts.log} 日志</span></div>
          {draft.warnings.length > 0 && <div className="preset-warnings"><strong><AlertTriangle size={13} />生成警告</strong>{draft.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
          <div className="generated-sources">{draft.preset.sources.map((source) => <div key={source.id}><strong>{source.label}</strong><code>{source.relativePath}</code><span>{source.patterns.length} 条规则</span><ChevronRight size={13} /></div>)}</div>
        </section>
        <section className="preset-json-preview"><div className="preview-title"><span><FileJson2 size={15} />声明式 JSON</span><b>只读</b></div><pre>{JSON.stringify(draft.preset, null, 2)}</pre></section>
      </div>
      <footer className="preset-preview-actions"><button className="button secondary" disabled={saving} onClick={onBack}>返回修改线索</button><span><ShieldCheck size={13} />保存前已通过路径、规则与数据结构校验</span><button className="button primary" disabled={saving} onClick={() => void onSave()}>{saving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{saving ? '正在保存…' : '确认导入并扫描'}</button></footer>
    </div>
  )
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '操作失败，请稍后重试。'
}
