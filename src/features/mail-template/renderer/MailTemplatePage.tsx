import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Clipboard,
  Copy,
  FileJson,
  FileUp,
  Mail,
  Maximize2,
  Minimize2,
  Plus,
  Save,
  Send,
  Trash2
} from 'lucide-react'
import { PageHeader } from '../../../platform/renderer/components/PageHeader'
import type { ImportedMailMessage, JsonObject, MailTemplate } from '../shared/contracts'
import { parseJsonObject, renderMailTemplate, validateMailTemplate } from '../shared/template-engine'
import { highlightMissingVariables, mailHtmlToText, plainTextToMailHtml, sanitizeMailHtml } from '../shared/rich-body'
import {
  createBlankTemplate,
  duplicateMailTemplate,
  loadMailTemplateLibrary,
  saveMailTemplates
} from './template-storage'
import { RichMailEditor } from './RichMailEditor'
import './mail-template.css'

type TemplateForm = Omit<MailTemplate, 'defaults' | 'bodyText'> & { defaultsJson: string }
type Notice = { kind: 'success' | 'error'; text: string }

export function MailTemplatePage(): React.JSX.Element {
  const initialLibrary = useMemo(() => loadMailTemplateLibrary(localStorage), [])
  const initialTemplates = initialLibrary.templates
  const [templates, setTemplates] = useState(initialTemplates)
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplates[0]?.id ?? null)
  const [form, setForm] = useState<TemplateForm>(() => toForm(initialTemplates[0] ?? createBlankTemplate()))
  const [perSendJson, setPerSendJson] = useState('{}')
  const [notice, setNotice] = useState<Notice | null>(() => initialLibrary.error ? { kind: 'error', text: initialLibrary.error } : null)
  const [opening, setOpening] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importedSource, setImportedSource] = useState<ImportedMailMessage | null>(null)
  const [focusMode, setFocusMode] = useState(false)
  const scrollTopBeforeFocus = useRef(0)
  const focusModeWasActive = useRef(false)

  useEffect(() => {
    const mainContent = document.querySelector<HTMLElement>('.main-content')
    if (focusMode) {
      mainContent?.scrollTo?.({ top: 0 })
      focusModeWasActive.current = true
      const exitOnEscape = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') setFocusMode(false)
      }
      document.addEventListener('keydown', exitOnEscape)
      return () => document.removeEventListener('keydown', exitOnEscape)
    }
    if (focusModeWasActive.current) {
      mainContent?.scrollTo?.({ top: scrollTopBeforeFocus.current })
      focusModeWasActive.current = false
    }
  }, [focusMode])

  const defaultsResult = useMemo(() => parseJsonObject(form.defaultsJson), [form.defaultsJson])
  const perSendResult = useMemo(() => parseJsonObject(perSendJson), [perSendJson])
  const currentTemplate = useMemo(
    () => fromForm(form, defaultsResult.ok ? defaultsResult.value : {}),
    [form, defaultsResult]
  )
  const rendered = useMemo(
    () => renderMailTemplate(currentTemplate, perSendResult.ok ? perSendResult.value : {}),
    [currentTemplate, perSendResult]
  )
  const inputErrors = [
    ...(defaultsResult.ok ? [] : [`默认 JSON：${defaultsResult.error}`]),
    ...(perSendResult.ok ? [] : [`本次 JSON：${perSendResult.error}`])
  ]
  const allIssues = [...inputErrors, ...rendered.issues.map((issue) => issue.message)]
  const savedTemplate = templates.find((template) => template.id === selectedId)
  const isDirty = !savedTemplate || JSON.stringify(toForm(savedTemplate)) !== JSON.stringify(form)
  const canOpen = allIssues.length === 0 && !opening

  const enterFocusMode = (): void => {
    scrollTopBeforeFocus.current = document.querySelector<HTMLElement>('.main-content')?.scrollTop ?? 0
    setFocusMode(true)
  }

  const persist = (next: MailTemplate[]): void => {
    setTemplates(next)
    saveMailTemplates(localStorage, next)
  }

  const selectTemplate = (template: MailTemplate): void => {
    setSelectedId(template.id)
    setForm(toForm(template))
    setPerSendJson('{}')
    setImportedSource(null)
    setNotice(null)
  }

  const createTemplate = (): void => {
    const blank = createBlankTemplate()
    setSelectedId(blank.id)
    setForm(toForm(blank))
    setPerSendJson('{}')
    setImportedSource(null)
    setNotice({ kind: 'success', text: '已创建空白模板，填写后点击“保存模板”。' })
  }

  const importMessage = async (): Promise<void> => {
    setImporting(true)
    try {
      const imported = await window.restx.mailTemplates.importMessage()
      if (!imported) return
      const blank = createBlankTemplate()
      const importedTemplate: MailTemplate = {
        ...blank,
        name: templateNameFromSource(imported.sourceName),
        to: imported.to,
        cc: imported.cc,
        bcc: imported.bcc,
        subject: imported.subject,
        bodyHtml: plainTextToMailHtml(imported.body),
        bodyText: imported.body
      }
      setSelectedId(importedTemplate.id)
      setForm(toForm(importedTemplate))
      setPerSendJson('{}')
      setImportedSource(imported)
      setNotice({ kind: 'success', text: '邮件已导入编辑区。请标记每次变化的内容，然后保存模板。' })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setImporting(false)
    }
  }

  const saveTemplate = (): void => {
    if (!defaultsResult.ok) {
      setNotice({ kind: 'error', text: defaultsResult.error })
      return
    }
    const template = { ...fromForm(form, defaultsResult.value), updatedAt: new Date().toISOString() }
    const errors = validateMailTemplate(template)
    if (errors.length > 0) {
      setNotice({ kind: 'error', text: errors[0] })
      return
    }
    const next = templates.some((item) => item.id === template.id)
      ? templates.map((item) => item.id === template.id ? template : item)
      : [...templates, template]
    persist(next)
    setSelectedId(template.id)
    setForm(toForm(template))
    setNotice({ kind: 'success', text: `模板“${template.name}”已保存。` })
  }

  const duplicateTemplate = (): void => {
    const source = templates.find((template) => template.id === selectedId)
    if (!source) return
    const duplicate = duplicateMailTemplate(source)
    persist([...templates, duplicate])
    setSelectedId(duplicate.id)
    setForm(toForm(duplicate))
    setPerSendJson('{}')
    setImportedSource(null)
    setNotice({ kind: 'success', text: `已创建“${duplicate.name}”。` })
  }

  const deleteTemplate = (): void => {
    const source = templates.find((template) => template.id === selectedId)
    if (!source || !window.confirm(`确定删除模板“${source.name}”吗？`)) return
    const next = templates.filter((template) => template.id !== source.id)
    persist(next)
    const replacement = next[0] ?? createBlankTemplate()
    setSelectedId(replacement.id)
    setForm(toForm(replacement))
    setPerSendJson('{}')
    setImportedSource(null)
    setNotice({ kind: 'success', text: `模板“${source.name}”已删除。` })
  }

  const openMailClient = async (): Promise<void> => {
    if (!canOpen) return
    setOpening(true)
    setNotice(null)
    try {
      await window.restx.mailTemplates.openDraft(rendered.draft)
      setNotice({ kind: 'success', text: '已在经典 Outlook 中打开草稿，请检查后再发送。' })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason) })
    } finally {
      setOpening(false)
    }
  }

  const copyRichBody = async (): Promise<void> => {
    if (!canOpen) return
    try {
      if (!globalThis.ClipboardItem || !navigator.clipboard?.write) throw new Error('当前环境不支持富文本剪贴板。')
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([rendered.draft.bodyHtml], { type: 'text/html' }),
        'text/plain': new Blob([rendered.draft.bodyText], { type: 'text/plain' })
      })])
      setNotice({ kind: 'success', text: '已复制富文本正文，可直接粘贴到 Outlook。' })
    } catch (reason) {
      setNotice({ kind: 'error', text: errorMessage(reason, '复制失败，请在预览区手动选择正文。') })
    }
  }

  return (
    <div className={`page mail-template-page${focusMode ? ' is-focus-mode' : ''}`}>
      <PageHeader
        eyebrow="MAIL TEMPLATES"
        title="邮件模板"
        description="保存经常重复使用的邮件，只填写本次变化的数据，就能得到完整邮件。"
        actions={<div className="mail-header-actions"><button className="button" disabled={importing} onClick={() => void importMessage()}><FileUp size={15} />{importing ? '正在导入…' : '导入 Outlook 邮件'}</button><button className="button primary" onClick={createTemplate}><Plus size={15} />新建模板</button></div>}
      />

      {notice && <div className={`mail-notice ${notice.kind}`}>{notice.kind === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}<span>{notice.text}</span></div>}

      <div className="mail-template-workspace">
        <aside className="template-library" aria-label="模板列表">
          <div className="workspace-heading"><span>我的模板</span><small>{templates.length} 个</small></div>
          <div className="template-list">
            {templates.map((template) => (
              <button
                key={template.id}
                className={`template-card ${selectedId === template.id ? 'active' : ''}`}
                onClick={() => selectTemplate(template)}
              >
                <Mail size={16} />
                <span><strong>{template.name}</strong><small>{template.subject || '暂无标题'}</small></span>
              </button>
            ))}
            {templates.length === 0 && <div className="empty-library"><Mail size={22} /><span>还没有模板</span><button className="button compact" onClick={createTemplate}>新建第一个</button></div>}
          </div>
          <div className="library-tip"><FileJson size={14} /><span>模板和填写的数据只保存在当前电脑。</span></div>
        </aside>

        <section className="template-editor" aria-label="模板编辑">
          <div className="workspace-heading">
            <span>模板内容</span>
            <div className="workspace-heading-actions">
              {isDirty && <small className="unsaved-dot">未保存</small>}
              <FocusModeButton active={focusMode} enter={enterFocusMode} exit={() => setFocusMode(false)} />
            </div>
          </div>
          {importedSource && <div className="import-summary"><FileUp size={16} /><div><strong>已导入 {importedSource.format.toUpperCase()}</strong><span>{importedSource.sourceName}</span><small>请把每次变化的内容改成 {'{{变量名}}'}，再点击保存模板。</small>{importedSource.warnings.map((warning) => <em key={warning}>{warning}</em>)}</div></div>}
          <div className="editor-scroll">
            <div className="mail-editor-secondary">
              <Field label="模板名称"><input aria-label="模板名称" value={form.name} onChange={(event) => updateForm(setForm, 'name', event.target.value)} /></Field>
              <Field label="收件人 To" hint="多个邮箱用逗号、分号或换行分隔"><textarea aria-label="收件人 To" rows={2} value={form.to} onChange={(event) => updateForm(setForm, 'to', event.target.value)} /></Field>
              <div className="compact-field-grid">
                <Field label="抄送 CC"><textarea aria-label="抄送 CC" rows={2} value={form.cc} onChange={(event) => updateForm(setForm, 'cc', event.target.value)} /></Field>
                <Field label="密送 BCC"><textarea aria-label="密送 BCC" rows={2} value={form.bcc} onChange={(event) => updateForm(setForm, 'bcc', event.target.value)} /></Field>
              </div>
              <Field label="邮件标题"><input aria-label="邮件标题" value={form.subject} onChange={(event) => updateForm(setForm, 'subject', event.target.value)} /></Field>
            </div>
            <div className="mail-body-focus">
              <Field label="邮件正文" hint="支持从 Excel 直接粘贴表格；用 {{变量名}} 标记每次需要替换的内容">
                <RichMailEditor
                  value={form.bodyHtml}
                  onChange={(value) => updateForm(setForm, 'bodyHtml', value)}
                  onNotice={(text, kind = 'success') => setNotice({ kind, text })}
                />
              </Field>
            </div>
            <div className="mail-editor-secondary">
              <Field label="默认 JSON" hint="本次没有填写的变量会使用这里的默认值"><textarea aria-label="默认 JSON" className={`json-editor ${defaultsResult.ok ? '' : 'invalid'}`} rows={9} spellCheck={false} value={form.defaultsJson} onChange={(event) => updateForm(setForm, 'defaultsJson', event.target.value)} /></Field>
              {!defaultsResult.ok && <InlineError text={defaultsResult.error} />}
            </div>
          </div>
          <div className="editor-actions">
            <button className="button primary" onClick={saveTemplate}><Save size={14} />保存模板</button>
            <button className="button" disabled={!savedTemplate} onClick={duplicateTemplate}><Copy size={14} />复制</button>
            <button className="button danger" disabled={!savedTemplate} onClick={deleteTemplate}><Trash2 size={14} />删除</button>
          </div>
        </section>

        <section className="reuse-panel" aria-label="邮件复用与预览">
          <div className="workspace-heading">
            <span>本次邮件</span>
            <div className="workspace-heading-actions">
              <small>JSON 可只填变化内容</small>
              <FocusModeButton active={focusMode} enter={enterFocusMode} exit={() => setFocusMode(false)} />
            </div>
          </div>
          <div className="reuse-content">
            <div className="mail-reuse-secondary">
              <Field label="本次 JSON" hint="留空或填写 {} 时全部使用默认值"><textarea aria-label="本次 JSON" className={`json-editor per-send-editor ${perSendResult.ok ? '' : 'invalid'}`} rows={8} spellCheck={false} value={perSendJson} onChange={(event) => setPerSendJson(event.target.value)} /></Field>
              {!perSendResult.ok && <InlineError text={perSendResult.error} />}
            </div>

            <div className="preview-card">
              <div className="preview-title"><span>最终邮件预览</span><small className={allIssues.length === 0 ? 'ready' : 'blocked'}>{allIssues.length === 0 ? '可以打开' : `${allIssues.length} 个问题`}</small></div>
              <div className="preview-context">
                <PreviewRecipients label="收件人" values={rendered.draft.to} />
                {rendered.draft.cc.length > 0 && <PreviewRecipients label="抄送" values={rendered.draft.cc} />}
                {rendered.draft.bcc.length > 0 && <PreviewRecipients label="密送" values={rendered.draft.bcc} />}
                <div className="preview-subject"><span>标题</span><strong>{highlightPlaceholders(rendered.draft.subject) || '（空）'}</strong></div>
              </div>
              {rendered.draft.bodyText
                ? <div className="preview-body rich-preview" dangerouslySetInnerHTML={{ __html: highlightMissingVariables(rendered.draft.bodyHtml, rendered.missingVariables) }} />
                : <div className="preview-body empty-preview">（正文为空）</div>}
            </div>

            {allIssues.length > 0 && <div className="issue-list" role="alert"><div><AlertCircle size={15} /><strong>还需要处理</strong></div><ul>{allIssues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul></div>}
          </div>
          <div className="handoff-actions">
            <div><strong>不会自动发送</strong><span>打开经典 Outlook 后由你最后确认</span></div>
            <div className="handoff-buttons"><button className="button" disabled={!canOpen} onClick={() => void copyRichBody()}><Clipboard size={14} />复制富文本正文</button><button className="button primary large" disabled={!canOpen} onClick={() => void openMailClient()}><Send size={15} />{opening ? '正在打开…' : '在 Outlook 中打开'}</button></div>
          </div>
        </section>
      </div>
    </div>
  )
}

function FocusModeButton({ active, enter, exit }: { active: boolean; enter(): void; exit(): void }): React.JSX.Element {
  return active
    ? <button type="button" className="button compact workspace-focus-button" aria-label="退出专注模式" onClick={exit}><Minimize2 size={13} />退出专注</button>
    : <button type="button" className="button compact workspace-focus-button" aria-label="展开正文工作区" onClick={enter}><Maximize2 size={13} />展开</button>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return <label className="mail-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function InlineError({ text }: { text: string }): React.JSX.Element {
  return <div className="inline-error"><AlertCircle size={13} />{text}</div>
}

function PreviewRecipients({ label, values }: { label: string; values: string[] }): React.JSX.Element {
  return <div className="preview-recipients"><span>{label}</span><div>{values.length > 0 ? values.map((value) => <em key={value}>{highlightPlaceholders(value)}</em>) : <i>未填写</i>}</div></div>
}

function highlightPlaceholders(source: string): React.ReactNode {
  const parts = source.split(/(\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*\}\})/g)
  return parts.map((part, index) => /^\{\{/.test(part)
    ? <mark key={`${part}-${index}`}>{part}</mark>
    : part)
}

function toForm(template: MailTemplate): TemplateForm {
  const { bodyText: _bodyText, ...fields } = template
  return { ...fields, defaultsJson: JSON.stringify(template.defaults, null, 2) }
}

function fromForm(form: TemplateForm, defaults: JsonObject): MailTemplate {
  const { defaultsJson: _defaultsJson, ...template } = form
  const bodyHtml = sanitizeMailHtml(template.bodyHtml).html
  return { ...template, bodyHtml, bodyText: mailHtmlToText(bodyHtml), defaults }
}

function updateForm(setForm: React.Dispatch<React.SetStateAction<TemplateForm>>, field: keyof TemplateForm, value: string): void {
  setForm((current) => ({ ...current, [field]: value }))
}

function errorMessage(reason: unknown, fallback = '无法打开经典 Outlook，请复制富文本正文后手动新建邮件。'): string {
  return reason instanceof Error
    ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
    : fallback
}

function templateNameFromSource(sourceName: string): string {
  const value = sourceName.replace(/\.(?:eml|msg)$/i, '').trim()
  return value || '导入的邮件模板'
}
