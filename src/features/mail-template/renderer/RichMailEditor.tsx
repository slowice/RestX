import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { BackgroundColor, Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { normalizeClipboardTable } from './excel-paste'
import { suggestRowAlias, VARIABLE_ALIAS_PATTERN, VARIABLE_PATH_PATTERN } from './dynamic-rows'
import { sanitizeMailHtml, sanitizeMailStyle, sanitizeMailTemplateHtml } from '../shared/rich-body'
import { useAdaptiveMailScale } from './use-adaptive-mail-scale'

type RichMailEditorProps = {
  value: string
  onChange(value: string): void
  onNotice(message: string, kind?: 'success' | 'error'): void
  autoScale: boolean
  layoutKey: string
  onScaleChange(scale: number): void
  onRequestActualSize(): void
}

type PendingEditorPointer = {
  localX: number
  localY: number
  viewportX: number
  viewportY: number
}

const StyledTable = Table.extend({
  addAttributes() {
    return { ...(this.parent?.() ?? {}), style: styleAttribute('table') }
  }
}).configure({ resizable: true, lastColumnResizable: true, allowTableNodeSelection: true })

const StyledTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      style: styleAttribute('tr'),
      repeatPath: dataAttribute('data-repeat-path'),
      repeatAlias: dataAttribute('data-repeat-alias')
    }
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

export function RichMailEditor({ value, onChange, onNotice, autoScale, layoutKey, onScaleChange, onRequestActualSize }: RichMailEditorProps): React.JSX.Element {
  const [, setSelectionRevision] = useState(0)
  const [bindingPanelOpen, setBindingPanelOpen] = useState(false)
  const [bindingPath, setBindingPath] = useState('items')
  const [bindingAlias, setBindingAlias] = useState('item')
  const pendingPointer = useRef<PendingEditorPointer | null>(null)
  const suppressPointerSequence = useRef(false)
  const pointerReleaseTimer = useRef(0)
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
    onUpdate: ({ editor }) => {
      const html = sanitizeMailTemplateHtml(editor.getHTML()).html
      console.info('[mail-template:dynamic-rows][00] editor-updated', {
        hasBinding: html.includes('data-repeat-path='),
        htmlLength: html.length
      })
      onChange(html)
    }
  })
  const { viewportRef, contentRef, viewport, scale } = useAdaptiveMailScale(autoScale, `${layoutKey}:${editor ? 'ready' : 'loading'}`)

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const sanitized = sanitizeMailTemplateHtml(value).html
    const current = sanitizeMailTemplateHtml(editor.getHTML()).html
    if (current !== sanitized) {
      console.info('[mail-template:dynamic-rows][00] editor-synchronized', {
        currentHasBinding: current.includes('data-repeat-path='),
        incomingHasBinding: sanitized.includes('data-repeat-path='),
        currentLength: current.length,
        incomingLength: sanitized.length
      })
      editor.commands.setContent(sanitized, { emitUpdate: false })
    }
  }, [editor, value])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const refreshToolbar = (): void => setSelectionRevision((current) => current + 1)
    editor.on('selectionUpdate', refreshToolbar)
    return () => editor.off('selectionUpdate', refreshToolbar)
  }, [editor])

  useEffect(() => onScaleChange(scale), [onScaleChange, scale])

  useEffect(() => () => window.clearTimeout(pointerReleaseTimer.current), [])

  useEffect(() => {
    const pending = pendingPointer.current
    if (!editor || !pending || scale !== 1 || !viewport) return
    pendingPointer.current = null
    viewport.scrollLeft = Math.max(0, pending.localX - pending.viewportX)
    viewport.scrollTop = Math.max(0, pending.localY - pending.viewportY)
    requestAnimationFrame(() => {
      const rect = viewport.getBoundingClientRect()
      const position = editor.view.posAtCoords({
        left: rect.left + pending.viewportX,
        top: rect.top + pending.viewportY
      })
      editor.commands.focus(position?.pos ?? 'end')
    })
  }, [editor, scale, viewport])

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

  const handleScaledPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!autoScale || scale >= 1) return
    const viewport = event.currentTarget
    const surface = viewport.querySelector<HTMLElement>('.mail-scale-surface')
    if (!surface) return
    const viewportRect = viewport.getBoundingClientRect()
    const surfaceRect = surface.getBoundingClientRect()
    event.preventDefault()
    event.stopPropagation()
    pendingPointer.current = {
      localX: (event.clientX - surfaceRect.left) / scale,
      localY: (event.clientY - surfaceRect.top) / scale,
      viewportX: event.clientX - viewportRect.left,
      viewportY: event.clientY - viewportRect.top
    }
    suppressPointerSequence.current = true
    onRequestActualSize()
  }

  const suppressScaledPointerEnd = (event: React.SyntheticEvent<HTMLDivElement>): void => {
    if (!suppressPointerSequence.current) return
    event.preventDefault()
    event.stopPropagation()
    window.clearTimeout(pointerReleaseTimer.current)
    pointerReleaseTimer.current = window.setTimeout(() => {
      suppressPointerSequence.current = false
      editor?.commands.focus()
    })
  }

  return (
    <div className="rich-mail-editor" onPasteCapture={handlePaste}>
      <EditorToolbar
        editor={editor}
        bindingPanelOpen={bindingPanelOpen}
        onOpenBinding={() => {
          const attributes = editor.getAttributes('tableRow')
          const path = typeof attributes.repeatPath === 'string' && attributes.repeatPath ? attributes.repeatPath : 'items'
          setBindingPath(path)
          setBindingAlias(typeof attributes.repeatAlias === 'string' && attributes.repeatAlias ? attributes.repeatAlias : suggestRowAlias(path))
          setBindingPanelOpen(true)
        }}
        onRemoveBinding={() => {
          if (!editor.isActive('table')) return
          updateSelectedTableRowAttributes(editor, { repeatPath: null, repeatAlias: null })
          onChange(sanitizeMailTemplateHtml(editor.getHTML()).html)
          setBindingPanelOpen(false)
          onNotice('当前表格行已恢复为普通固定行。')
        }}
      />
      {bindingPanelOpen && <RowBindingPanel
        editor={editor}
        path={bindingPath}
        alias={bindingAlias}
        onPathChange={(path) => {
          setBindingPath(path)
          setBindingAlias(suggestRowAlias(path))
        }}
        onAliasChange={setBindingAlias}
        onCancel={() => setBindingPanelOpen(false)}
        onNotice={onNotice}
        onContentChange={(html) => onChange(sanitizeMailTemplateHtml(html).html)}
        onApplied={() => setBindingPanelOpen(false)}
      />}
      <div
        ref={viewportRef}
        className="mail-scale-viewport editor-scale-viewport"
        onPointerDownCapture={handleScaledPointerDown}
        onPointerUpCapture={suppressScaledPointerEnd}
        onClickCapture={suppressScaledPointerEnd}
      >
        <div ref={contentRef} className="mail-scale-surface" style={{ zoom: scale }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}

function EditorToolbar({ editor, bindingPanelOpen, onOpenBinding, onRemoveBinding }: {
  editor: Editor
  bindingPanelOpen: boolean
  onOpenBinding(): void
  onRemoveBinding(): void
}): React.JSX.Element {
  const inTable = editor.isActive('table')
  const rowAttributes = editor.getAttributes('tableRow')
  const rowIsBound = typeof rowAttributes.repeatPath === 'string' && rowAttributes.repeatPath.length > 0
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
      <Tool label={rowIsBound ? '修改数据行' : '设为数据行'} active={bindingPanelOpen || rowIsBound} disabled={!inTable} run={onOpenBinding} />
      <Tool label="取消数据行" disabled={!inTable || !rowIsBound} run={onRemoveBinding} />
      <Tool label="单元格左" disabled={!inTable} run={() => updateCellStyle(editor, 'text-align', 'left')} />
      <Tool label="单元格中" disabled={!inTable} run={() => updateCellStyle(editor, 'text-align', 'center')} />
      <Tool label="单元格右" disabled={!inTable} run={() => updateCellStyle(editor, 'text-align', 'right')} />
      <ColorTool label="单元格背景" value={readStyle(cellStyle, 'background-color') ?? '#ffffff'} disabled={!inTable} run={(color) => updateCellStyle(editor, 'background-color', color)} />
      <ColorTool label="单元格边框" value="#b8b8b8" disabled={!inTable} run={(color) => updateCellStyle(editor, 'border', `1px solid ${color}`)} />
      <Tool label="删除表格" disabled={!editor.can().deleteTable()} run={() => editor.chain().focus().deleteTable().run()} />
    </div>
  )
}

function RowBindingPanel({ editor, path, alias, onPathChange, onAliasChange, onCancel, onNotice, onContentChange, onApplied }: {
  editor: Editor
  path: string
  alias: string
  onPathChange(value: string): void
  onAliasChange(value: string): void
  onCancel(): void
  onNotice(message: string, kind?: 'success' | 'error'): void
  onContentChange(html: string): void
  onApplied(): void
}): React.JSX.Element {
  const apply = (): void => {
    const normalizedPath = path.trim()
    const normalizedAlias = alias.trim()
    if (!VARIABLE_PATH_PATTERN.test(normalizedPath)) {
      onNotice('数组路径格式无效，请填写 items 或 report.items 这类路径。', 'error')
      return
    }
    if (!VARIABLE_ALIAS_PATTERN.test(normalizedAlias)) {
      onNotice('行别名格式无效，请使用 item 这类单个名称。', 'error')
      return
    }
    const selectedRow = selectedTableRow(editor)
    if (!selectedRow) {
      onNotice('请先把光标放在要重复的表格行中。', 'error')
      return
    }
    if (Array.from(selectedRow.cells).some((cell) => cell.rowSpan > 1)) {
      onNotice('动态数据行不能包含跨行合并单元格，请先拆分后再设置。', 'error')
      return
    }
    const table = selectedRow.closest('table')
    const otherBoundRow = table && Array.from(table.querySelectorAll<HTMLTableRowElement>('tr[data-repeat-path]'))
      .some((row) => row !== selectedRow)
    if (otherBoundRow) {
      onNotice('一张表格只能设置一个动态数据行。', 'error')
      return
    }
    if (!updateSelectedTableRowAttributes(editor, { repeatPath: normalizedPath, repeatAlias: normalizedAlias })) {
      onNotice('无法设置当前表格行，请重新把光标放入该行后再试。', 'error')
      return
    }
    onContentChange(editor.getHTML())
    onNotice(`已将当前行绑定到 ${normalizedPath}，行内变量请使用 {{${normalizedAlias}.字段名}}。`)
    window.setTimeout(onApplied, 0)
  }

  return <div className="dynamic-row-binding-panel" aria-label="动态数据行设置">
    <label><span>数组路径</span><input aria-label="动态行数组路径" value={path} onChange={(event) => onPathChange(event.target.value)} placeholder="items" /></label>
    <label><span>行别名</span><input aria-label="动态行别名" value={alias} onChange={(event) => onAliasChange(event.target.value)} placeholder="item" /></label>
    <small>例如数组路径 items，对应行内变量 {'{{item.name}}'}。</small>
    <div><button type="button" className="button compact" onClick={onCancel}>取消</button><button type="button" className="button compact primary" onClick={apply}>应用</button></div>
  </div>
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

function dataAttribute(attribute: 'data-repeat-path' | 'data-repeat-alias') {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute(attribute),
    renderHTML: (attributes: Record<string, unknown>) => {
      const key = attribute === 'data-repeat-path' ? 'repeatPath' : 'repeatAlias'
      return typeof attributes[key] === 'string' && attributes[key] ? { [attribute]: attributes[key] } : {}
    }
  }
}

function selectedTableRow(editor: Editor): HTMLTableRowElement | null {
  const position = editor.view.domAtPos(editor.state.selection.from)
  const element = position.node instanceof HTMLElement ? position.node : position.node.parentElement
  return element?.closest<HTMLTableRowElement>('tr') ?? null
}

function updateSelectedTableRowAttributes(editor: Editor, attributes: { repeatPath: string | null; repeatAlias: string | null }): boolean {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'tableRow') continue
    const transaction = editor.state.tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, ...attributes })
    editor.view.dispatch(transaction)
    console.info('[mail-template:dynamic-rows][00] binding-updated', {
      hasPath: Boolean(editor.getAttributes('tableRow').repeatPath),
      removing: attributes.repeatPath === null
    })
    return true
  }
  return false
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
