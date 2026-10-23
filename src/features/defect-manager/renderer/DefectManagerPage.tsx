import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, FileText, ImagePlus, Pencil, Plus, Search, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { AttachmentInput, DefectAttachment, DefectInput, DefectRecord } from '../shared/contracts'
import { MAX_ANALYSIS_BYTES, MAX_IMAGE_BYTES, MAX_SCREENSHOTS } from '../shared/contracts'
import './defect-manager.css'

const api = () => window.restx.defects
const message = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请重试。'

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }): ReactNode {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className={`defect-dialog ${wide ? 'defect-preview' : ''}`} onCancel={(event) => { event.preventDefault(); onClose() }}>
    <header><h2>{title}</h2><button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={18} /></button></header>
    {children}
  </dialog>
}

function Thumbnail({ record, attachment, onOpen }: { record: DefectRecord; attachment: DefectAttachment; onOpen?: () => void }): ReactNode {
  const ref = useRef<HTMLButtonElement>(null)
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      void api().image(record.id, attachment.id, false).then((result) => { if (active) setSource(result) }).catch(() => { if (active) setFailed(true) })
    })
    if (ref.current) observer.observe(ref.current)
    return () => { active = false; observer.disconnect() }
  }, [record.id, attachment.id])
  return <button type="button" ref={ref} className="defect-thumb" disabled={!onOpen} title={onOpen ? `放大：${attachment.name}` : attachment.name} aria-label={onOpen ? `放大：${attachment.name}` : attachment.name} onClick={onOpen}>
    {source ? <img src={source} alt={attachment.name} /> : <span>{failed ? '读取失败' : '截图'}</span>}
  </button>
}

async function readAttachment(file: File, image: boolean): Promise<AttachmentInput> {
  if (file.size > (image ? MAX_IMAGE_BYTES : MAX_ANALYSIS_BYTES)) throw new Error(image ? '单张截图不能超过 10 MB。' : '分析文件不能超过 5 MB。')
  if (image ? !/^image\/(png|jpeg|webp)$/.test(file.type) : !/\.md$/i.test(file.name)) throw new Error(image ? '请选择 PNG、JPEG 或 WebP 图片。' : '分析结果只支持 .md 文件。')
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取附件，请重新选择。'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(file)
  })
  return { name: file.name, data }
}

function Editor({ record, onClose, onSaved }: { record: DefectRecord | null; onClose: () => void; onSaved: (record: DefectRecord) => void }): ReactNode {
  const [draft, setDraft] = useState<DefectInput>(record ? { ...record } : {
    phenomenon: '', characteristics: '', dtsNumber: '', dtsUrl: '', screenshots: [], analysis: null
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (field: 'phenomenon' | 'characteristics' | 'dtsNumber' | 'dtsUrl', value: string) => setDraft((previous) => ({ ...previous, [field]: value }))
  async function importFiles(files: File[], image: boolean): Promise<void> {
    if (!files.length || busy) return
    setBusy(true); setError('')
    try {
      if (image && draft.screenshots.length + files.length > MAX_SCREENSHOTS) throw new Error('每条记录最多 20 张截图。')
      const attachments = await Promise.all(files.map((file) => readAttachment(file, image)))
      setDraft((previous) => image ? { ...previous, screenshots: [...previous.screenshots, ...attachments] } : { ...previous, analysis: attachments[0] })
    } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }
  return <Modal title={record ? '编辑缺陷' : '新增缺陷'} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={(event) => {
      event.preventDefault(); setBusy(true); setError('')
      void api().save({ ...draft, dtsUrl: draft.dtsUrl.trim() }).then(onSaved).catch((reason: unknown) => setError(message(reason))).finally(() => setBusy(false))
    }}>
      <div className="defect-form-body"><fieldset disabled={busy}>
        <label>问题现象 <span className="defect-required">*</span><textarea autoFocus required maxLength={20000} rows={3} value={draft.phenomenon} onChange={(event) => set('phenomenon', event.target.value)} placeholder="用户看到了什么？在什么操作后出现？" /></label>
        <label>问题特征<textarea maxLength={20000} rows={3} value={draft.characteristics} onChange={(event) => set('characteristics', event.target.value)} placeholder="错误码、日志关键词、复现条件等" /></label>
        <div className="defect-dts-fields">
          <label>DTS 编号<input value={draft.dtsNumber} maxLength={20000} onChange={(event) => set('dtsNumber', event.target.value)} placeholder="可填写任意编号或文本" /></label>
          <label>DTS 链接（选填）<input type="url" value={draft.dtsUrl} maxLength={20000} onChange={(event) => set('dtsUrl', event.target.value)} placeholder="留空时编号显示为普通文本" /></label>
        </div>
        <section className="defect-upload" tabIndex={0} aria-label="截图粘贴区域" onPaste={(event) => {
          const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
          if (files.length) { event.preventDefault(); void importFiles(files, true) }
        }}>
          <div className="defect-upload-heading"><strong>截图 <small>{draft.screenshots.length} / {MAX_SCREENSHOTS}</small></strong><label className="button compact"><ImagePlus size={15} />选择图片<input className="defect-file-input" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => { void importFiles(Array.from(event.target.files ?? []), true); event.target.value = '' }} /></label></div>
          <p>点击此区域后可 Ctrl+V 粘贴截图。支持 PNG、JPEG、WebP，每张不超过 10 MB。</p>
          <div className="defect-draft-images">{draft.screenshots.map((item, index) => <div className="defect-draft-image" key={'id' in item ? item.id : index}>
            {'data' in item ? <img src={`data:image/${item.name.toLowerCase().endsWith('.webp') ? 'webp' : /\.jpe?g$/i.test(item.name) ? 'jpeg' : 'png'};base64,${item.data}`} alt={item.name} /> : record ? <Thumbnail record={record} attachment={item} /> : null}
            <span title={item.name}>{item.name}</span><button type="button" className="icon-button" aria-label={`移除截图 ${index + 1}`} onClick={() => setDraft((previous) => ({ ...previous, screenshots: previous.screenshots.filter((_, position) => position !== index) }))}><X size={14} /></button>
          </div>)}</div>
        </section>
        <section className="defect-upload">
          <div className="defect-upload-heading"><strong>分析结果</strong><label className="button compact"><FileText size={15} />{draft.analysis ? '替换 MD' : '选择 MD'}<input className="defect-file-input" type="file" accept=".md" onChange={(event) => { void importFiles(Array.from(event.target.files ?? []), false); event.target.value = '' }} /></label></div>
          {draft.analysis ? <div className="defect-report-file"><FileText size={16} /><span>{draft.analysis.name}</span><button type="button" className="icon-button" aria-label="移除分析文件" onClick={() => setDraft((previous) => ({ ...previous, analysis: null }))}><X size={14} /></button></div> : <p>一个 UTF-8 编码的 Markdown 文件，不超过 5 MB。</p>}
        </section>
      </fieldset></div>
      {error && <p role="alert" className="defect-error">{error}</p>}
      <footer><span>附件将在保存时复制到本机数据目录</span><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy}>{busy ? '正在处理…' : '保存记录'}</button></footer>
    </form>
  </Modal>
}

export function DefectManagerPage(): ReactNode {
  const [records, setRecords] = useState<DefectRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<DefectRecord | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<DefectRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ name: string; source: string } | null>(null)
  const [zoom, setZoom] = useState(1)
  const request = useRef(0)
  const search = query.trim().toLocaleLowerCase()
  const filtered = records.filter((row) => [row.phenomenon, row.characteristics, row.dtsNumber, row.analysis?.name ?? ''].some((value) => value.toLocaleLowerCase().includes(search)))
  const reload = () => {
    setLoading(true); setError('')
    void api().list().then(setRecords).catch((reason: unknown) => setError(message(reason))).finally(() => setLoading(false))
  }
  useEffect(reload, [])
  const act = (operation: Promise<unknown>) => { setError(''); void operation.catch((reason: unknown) => setError(message(reason))) }
  const closePreview = () => { request.current++; setPreview(null) }
  return <div className="page defect-page">
    <header className="page-header"><div><div className="eyebrow">问题记录 / EVIDENCE</div><h1>缺陷管理</h1><p>把现象、特征和分析留在一起，让下一次排查有据可查。</p></div><button className="button primary" disabled={loading || busy} onClick={() => setEditing(null)}><Plus size={16} />新增缺陷</button></header>
    <div className="defect-toolbar"><label className="defect-search"><Search size={17} /><input aria-label="搜索缺陷" placeholder="搜索现象、特征、DTS 编号…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span>{filtered.length} / {records.length} 条</span><button className="button" disabled={!filtered.length || busy || loading} onClick={() => {
      setBusy(true); setError(''); setNotice('')
      void api().exportMarkdown(filtered.map((row) => row.id)).then((directory) => { if (directory) setNotice(`已导出 ${filtered.length} 条记录及附件：${directory}`) }).catch((reason: unknown) => setError(message(reason))).finally(() => setBusy(false))
    }}><Download size={16} />{busy ? '正在处理…' : search ? '导出筛选结果' : '导出 MD + 附件'}</button></div>
    {error && <div role="alert" className="defect-error">{error}<button className="button compact" onClick={reload}>重新加载</button></div>}
    {notice && <div role="status" className="defect-notice">{notice}</div>}
    <div className="defect-table-wrap"><table className="defect-table"><thead><tr><th>问题现象</th><th>问题特征</th><th>截图</th><th>DTS 单</th><th>分析结果</th><th><span className="defect-sr">操作</span></th></tr></thead><tbody>
      {filtered.map((row) => <tr key={row.id}><td className="defect-text">{row.phenomenon}</td><td className="defect-text defect-muted">{row.characteristics || '—'}</td><td><div className="defect-thumbnails">{row.screenshots.map((attachment) => <Thumbnail key={attachment.id} record={row} attachment={attachment} onOpen={() => {
        const ticket = ++request.current
        setZoom(1); setPreview({ name: attachment.name, source: '' })
        void api().image(row.id, attachment.id, true).then((source) => { if (request.current === ticket) setPreview({ name: attachment.name, source }) }).catch((reason: unknown) => { if (request.current === ticket) { setPreview(null); setError(message(reason)) } })
      }} />)}{!row.screenshots.length && <span className="defect-muted">—</span>}</div></td><td>{row.dtsUrl ? <a className="defect-link defect-dts" href={row.dtsUrl} onClick={(event) => { event.preventDefault(); act(api().openDts(row.id)) }}>{row.dtsNumber || row.dtsUrl}</a> : <span className="defect-dts">{row.dtsNumber || '—'}</span>}</td><td>{row.analysis ? <button className="defect-link defect-analysis" onClick={() => act(api().openAnalysis(row.id))}><FileText size={15} /><span>{row.analysis.name}</span></button> : <span className="defect-muted">待补充</span>}</td><td><div className="defect-row-actions"><button className="icon-button" aria-label={`编辑 ${row.phenomenon}`} disabled={busy} onClick={() => setEditing(row)}><Pencil size={15} /></button><button className="icon-button" aria-label={`删除 ${row.phenomenon}`} disabled={busy} onClick={() => setDeleting(row)}><Trash2 size={15} /></button></div></td></tr>)}
    </tbody></table>
    {loading ? <div className="defect-empty">正在读取记录…</div> : !filtered.length && <div className="defect-empty"><FileText size={30} /><h3>{search ? '没有找到匹配记录' : '从第一条问题开始'}</h3><p>{search ? '试试其他关键词，或清空搜索查看全部。' : '添加问题现象、截图和分析文件，逐步积累排查记录。'}</p>{!search && <button className="button" onClick={() => setEditing(null)}><Plus size={15} />新增缺陷</button>}</div>}
    </div><p className="defect-footnote">导出包含当前列表及附件。迁移时请复制整个导出文件夹。</p>
    {editing !== undefined && <Editor record={editing} onClose={() => setEditing(undefined)} onSaved={(record) => { setRecords((previous) => [record, ...previous.filter((row) => row.id !== record.id)]); setEditing(undefined); setNotice('记录已保存。') }} />}
    {deleting && <Modal title="删除这条缺陷？" onClose={() => { if (!busy) setDeleting(null) }}><div className="defect-delete-body"><p>{deleting.phenomenon}</p><p className="defect-muted">同时删除 RestX 保存的截图和分析附件，原始文件不受影响。此操作不可撤销。</p></div><footer><button className="button" disabled={busy} onClick={() => setDeleting(null)}>取消</button><button className="button danger" disabled={busy} onClick={() => {
      setBusy(true)
      void api().remove(deleting.id).then(() => { setRecords((previous) => previous.filter((row) => row.id !== deleting.id)); setDeleting(null); setNotice('记录已删除。') }).catch((reason: unknown) => { setError(message(reason)); setDeleting(null) }).finally(() => setBusy(false))
    }}>确认删除</button></footer></Modal>}
    {preview && <Modal title={preview.name} onClose={closePreview} wide><div className="defect-preview-tools"><button className="button compact" aria-label="缩小" onClick={() => setZoom((value) => Math.max(.25, value - .25))}><ZoomOut size={16} /></button><button className="button compact" onClick={() => setZoom(1)}>适应宽度</button><button className="button compact" aria-label="放大" onClick={() => setZoom((value) => Math.min(4, value + .25))}><ZoomIn size={16} /></button><span>{Math.round(zoom * 100)}%</span></div><div className="defect-image-stage">{preview.source ? <img src={preview.source} alt={preview.name} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} /> : <p>正在读取原图…</p>}</div></Modal>}
  </div>
}
