import { useEffect } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { BackgroundColor, Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { normalizeClipboardTable } from './excel-paste'
import { sanitizeMailHtml, sanitizeMailStyle } from '../shared/rich-body'
import { useAdaptiveMailScale } from './use-adaptive-mail-scale'

type RichMailEditorProps = {
  value: string
  onChange(value: string): void
  onNotice(message: string, kind?: 'success' | 'error'): void
  autoScale: boolean
  layoutKey: string
  onScaleChange(scale: number): void
}

const StyledTable = Table.extend({
  addAttributes() {
    return { ...(this.parent?.() ?? {}), style: styleAttribute('table') }
  }
}).configure({ resizable: true, lastColumnResizable: true, allowTableNodeSelection: true })

const StyledTableRow = TableRow.extend({
  addAttributes() {
    return { ...(this.parent?.() ?? {}), style: styleAttribute('tr') }
  }
})

const StyledTableCell = TableCell.extend({
  addAttributes() {
    return { ...(this.parent?.() ?? {}), style: styleAttribute('td') }
  }
})

const StyledTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...(this.parent?.() ?? {}), style: styleAttribute('th') }
  }
})

export function RichMailEditor({ value, onChange, onNotice, autoScale, layoutKey, onScaleChange }: RichMailEditorProps): React.JSX.Element {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      BackgroundColor,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      StyledTable,
      StyledTableRow,
      StyledTableCell,
      StyledTableHeader
    ],
    content: value,
    editorProps: { attributes: { class: 'rich-mail-content', 'aria-label': '邮件正文' } },
    onUpdate: ({ editor }) => onChange(sanitizeMailHtml(editor.getHTML()).html)
  })
  const { viewportRef, contentRef, scale } = useAdaptiveMailScale(autoScale, `${layoutKey}:${editor ? 'ready' : 'loading'}`)

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const sanitized = sanitizeMailHtml(value).html
    if (sanitizeMailHtml(editor.getHTML()).html !== sanitized) editor.commands.setContent(sanitized, { emitUpdate: false })
  }, [editor, value])

  useEffect(() => onScaleChange(scale), [onScaleChange, scale])

  if (!editor) return <div className="rich-mail-editor loading">正在加载正文编辑器…</div>

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>): void => {
    const html = event.clipboardData.getData('text/html')
    const text = event.clipboardData.getData('text/plain')
    const table = normalizeClipboardTable({ html, text })
    if (table) {
      event.preventDefault()
      if (table.kind === 'rejected') {
        onNotice(table.message, 'error')
        return
      }
      if (!editor.chain().focus().insertContent(table.html).run()) {
        onNotice('表格无法插入当前位置，正文未被修改。', 'error')
        return
      }
      onNotice(table.mode === 'tabular-text'
        ? '剪贴板没有 Excel 富文本表格，已按基础表格粘贴；合并单元格和原样式无法保留。'
        : 'Excel 表格已按安全邮件格式粘贴。')
      return
    }
    if (html) {
      event.preventDefault()
      const sanitized = sanitizeMailHtml(html).html
      if (!sanitized || !editor.chain().focus().insertContent(sanitized).run()) onNotice('剪贴板内容无法安全粘贴，正文未被修改。', 'error')
    }
  }

  return (
    <div className="rich-mail-editor" onPasteCapture={handlePaste}>
      <EditorToolbar editor={editor} />
      <div ref={viewportRef} className="mail-scale-viewport editor-scale-viewport">
        <div ref={contentRef} className="mail-scale-surface" style={{ zoom: scale }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}

function EditorToolbar({ editor }: { editor: Editor }): React.JSX.Element {
  const inTable = editor.isActive('table')
  const cellStyle = currentCellStyle(editor)
  return (
    <div className="rich-editor-toolbar" role="toolbar" aria-label="邮件正文格式">
      <Tool label="撤销" disabled={!editor.can().undo()} run={() => editor.chain().focus().undo().run()} />
      <Tool label="重做" disabled={!editor.can().redo()} run={() => editor.chain().focus().redo().run()} />
      <Tool label="粗体" active={editor.isActive('bold')} run={() => editor.chain().focus().toggleBold().run()} />
      <Tool label="斜体" active={editor.isActive('italic')} run={() => editor.chain().focus().toggleItalic().run()} />
      <Tool label="下划线" active={editor.isActive('underline')} run={() => editor.chain().focus().toggleUnderline().run()} />
      <ColorTool label="文字颜色" value="#202020" run={(color) => editor.chain().focus().setColor(color).run()} />
      <ColorTool label="文字背景" value="#fff2a8" run={(color) => editor.chain().focus().setBackgroundColor(color).run()} />
      <Tool label="左对齐" active={editor.isActive({ textAlign: 'left' })} run={() => editor.chain().focus().setTextAlign('left').run()} />
      <Tool label="居中" active={editor.isActive({ textAlign: 'center' })} run={() => editor.chain().focus().setTextAlign('center').run()} />
      <Tool label="右对齐" active={editor.isActive({ textAlign: 'right' })} run={() => editor.chain().focus().setTextAlign('right').run()} />
      <span className="toolbar-separator" />
      <Tool label="插入表格" run={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      <Tool label="前加行" disabled={!editor.can().addRowBefore()} run={() => editor.chain().focus().addRowBefore().run()} />
      <Tool label="后加行" disabled={!editor.can().addRowAfter()} run={() => editor.chain().focus().addRowAfter().run()} />
      <Tool label="删行" disabled={!editor.can().deleteRow()} run={() => editor.chain().focus().deleteRow().run()} />
      <Tool label="前加列" disabled={!editor.can().addColumnBefore()} run={() => editor.chain().focus().addColumnBefore().run()} />
      <Tool label="后加列" disabled={!editor.can().addColumnAfter()} run={() => editor.chain().focus().addColumnAfter().run()} />
      <Tool label="删列" disabled={!editor.can().deleteColumn()} run={() => editor.chain().focus().deleteColumn().run()} />
      <Tool label="合并" disabled={!editor.can().mergeCells()} run={() => editor.chain().focus().mergeCells().run()} />
      <Tool label="拆分" disabled={!editor.can().splitCell()} run={() => editor.chain().focus().splitCell().run()} />
      <Tool label="单元格左" disabled={!inTable} run={() => updateCellStyle(editor, 'text-align', 'left')} />
      <Tool label="单元格中" disabled={!inTable} run={() => updateCellStyle(editor, 'text-align', 'center')} />
      <Tool label="单元格右" disabled={!inTable} run={() => updateCellStyle(editor, 'text-align', 'right')} />
      <ColorTool label="单元格背景" value={readStyle(cellStyle, 'background-color') ?? '#ffffff'} disabled={!inTable} run={(color) => updateCellStyle(editor, 'background-color', color)} />
      <ColorTool label="单元格边框" value="#b8b8b8" disabled={!inTable} run={(color) => updateCellStyle(editor, 'border', `1px solid ${color}`)} />
      <Tool label="删除表格" disabled={!editor.can().deleteTable()} run={() => editor.chain().focus().deleteTable().run()} />
    </div>
  )
}

function Tool({ label, active = false, disabled = false, run }: { label: string; active?: boolean; disabled?: boolean; run(): void }): React.JSX.Element {
  return <button type="button" className={active ? 'active' : ''} aria-label={label} title={label} disabled={disabled} onClick={run}>{label}</button>
}

function ColorTool({ label, value, disabled = false, run }: { label: string; value: string; disabled?: boolean; run(value: string): void }): React.JSX.Element {
  return <label className={`color-tool ${disabled ? 'disabled' : ''}`} title={label}><span>{label}</span><input type="color" aria-label={label} disabled={disabled} value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(event) => run(event.target.value)} /></label>
}

function styleAttribute(tag: 'table' | 'tr' | 'th' | 'td') {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => sanitizeMailStyle(element.getAttribute('style') ?? '', tag),
    renderHTML: (attributes: Record<string, unknown>) => typeof attributes.style === 'string' && attributes.style ? { style: attributes.style } : {}
  }
}

function currentCellStyle(editor: Editor): string {
  const cell = editor.getAttributes('tableCell').style
  const header = editor.getAttributes('tableHeader').style
  return typeof cell === 'string' ? cell : typeof header === 'string' ? header : ''
}

function updateCellStyle(editor: Editor, property: string, value: string): void {
  const current = new Map(currentCellStyle(editor).split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf(':')
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()]
  }))
  current.set(property, value)
  const style = sanitizeMailStyle([...current].map(([name, entry]) => `${name}: ${entry}`).join(';'), 'td')
  editor.chain().focus().setCellAttribute('style', style).run()
}

function readStyle(style: string, property: string): string | null {
  for (const declaration of style.split(';')) {
    const [name, ...value] = declaration.split(':')
    if (name.trim() === property) return value.join(':').trim()
  }
  return null
}
