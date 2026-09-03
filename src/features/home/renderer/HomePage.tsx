import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, Columns3, ListTodo, LockKeyhole, LogIn, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { PageHeader } from '../../../platform/renderer/components/PageHeader'
import {
  getDefaultHomeTaskColumnWidth,
  HOME_TASK_COLUMN_MAX_WIDTH,
  HOME_TASK_COLUMN_MIN_WIDTH,
  type HomeLoginState,
  type HomeTaskColumn,
  type HomeTaskRow,
  type HomeTaskTable
} from '../shared/contracts'
import './home.css'

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed'

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : '操作失败，请重试。'
}

function today(): string {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function newRow(columns: HomeTaskColumn[]): HomeTaskRow {
  const timestamp = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    cells: Object.fromEntries(columns.map((column) => [column.id, column.type === 'date' ? today() : column.options?.[0] ?? ''])),
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

export function HomePage(): React.JSX.Element {
  const [loginState, setLoginState] = useState<HomeLoginState | null>(null)
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [table, setTable] = useState<HomeTaskTable | null>(null)
  const [tableError, setTableError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const tableRef = useRef<HomeTaskTable | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revisionRef = useRef(0)
  const savedRevisionRef = useRef(0)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  async function loadTable(): Promise<void> {
    setTableError(null)
    try {
      const next = await window.restx.home.getTaskTable()
      tableRef.current = next
      setTable(next)
      setSaveStatus('idle')
    } catch (reason) {
      setTableError(errorMessage(reason))
    }
  }

  useEffect(() => {
    let active = true
    void window.restx.home.getLoginState().then((state) => {
      if (!active) return
      setLoginState(state)
      setAccount(state.account)
      if (state.isLoggedIn) void loadTable()
    }).catch((reason) => {
      if (active) setLoginError(errorMessage(reason))
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (loginState?.callbackStatus !== 'running') return
    const poller = setInterval(() => {
      void window.restx.home.getLoginState().then((state) => {
        setLoginState(state)
        setAccount(state.account)
        if (state.callbackStatus !== 'running') clearInterval(poller)
      }).catch(() => clearInterval(poller))
    }, 500)
    return () => clearInterval(poller)
  }, [loginState?.callbackStatus])

  useEffect(() => () => {
    resizeCleanupRef.current?.()
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      const pending = tableRef.current
      if (pending && revisionRef.current > savedRevisionRef.current) void window.restx.home.saveTaskTable(pending)
    }
  }, [])

  async function submitLogin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (loginBusy) return
    console.info(`[home-daily][01] login_submitted account_present=${Boolean(account.trim())} password_present=${Boolean(password)}`)
    setLoginBusy(true)
    setLoginError(null)
    try {
      const state = await window.restx.home.login({ account: account.trim(), password })
      setLoginState(state)
      setAccount(state.account)
      setPassword('')
      console.info('[home-daily][04] task_table_unlocked')
      await loadTable()
    } catch (reason) {
      setLoginError(errorMessage(reason))
    } finally {
      setLoginBusy(false)
    }
  }

  async function persistTable(snapshot: HomeTaskTable, revision: number): Promise<void> {
    setSaveStatus('saving')
    try {
      await window.restx.home.saveTaskTable(snapshot)
      savedRevisionRef.current = Math.max(savedRevisionRef.current, revision)
      if (revision === revisionRef.current) setSaveStatus('saved')
    } catch (reason) {
      if (revision === revisionRef.current) {
        setSaveStatus('failed')
        setTableError(errorMessage(reason))
      }
    }
  }

  function applyTable(next: HomeTaskTable): void {
    tableRef.current = next
    setTable(next)
    setTableError(null)
    const revision = ++revisionRef.current
    setSaveStatus('pending')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void persistTable(next, revision)
    }, 450)
  }

  function updateCell(rowId: string, columnId: string, value: string): void {
    if (!table) return
    const timestamp = new Date().toISOString()
    applyTable({
      ...table,
      rows: table.rows.map((row) => row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: value }, updatedAt: timestamp } : row)
    })
  }

  function renameColumn(columnId: string, label: string): void {
    if (!table) return
    applyTable({ ...table, columns: table.columns.map((column) => column.id === columnId ? { ...column, label } : column) })
  }

  function addColumn(): void {
    if (!table) return
    const number = table.columns.filter((column) => column.id.startsWith('custom-')).length + 1
    applyTable({ ...table, columns: [...table.columns, { id: `custom-${crypto.randomUUID()}`, label: `新列 ${number}`, type: 'text', width: 180 }] })
  }

  function columnWidth(column: HomeTaskColumn): number {
    return column.width ?? getDefaultHomeTaskColumnWidth(column)
  }

  function setColumnWidth(columnId: string, width: number, save: boolean): void {
    const current = tableRef.current
    if (!current) return
    const next = { ...current, columns: current.columns.map((column) => column.id === columnId ? { ...column, width } : column) }
    if (save) applyTable(next)
    else {
      tableRef.current = next
      setTable(next)
      setSaveStatus('pending')
    }
  }

  function beginColumnResize(event: React.PointerEvent<HTMLSpanElement>, column: HomeTaskColumn): void {
    event.preventDefault()
    event.stopPropagation()
    resizeCleanupRef.current?.()
    const startX = event.clientX
    const startWidth = columnWidth(column)
    let currentWidth = startWidth
    let moved = false

    const onMove = (moveEvent: PointerEvent): void => {
      moved = true
      currentWidth = Math.min(HOME_TASK_COLUMN_MAX_WIDTH, Math.max(HOME_TASK_COLUMN_MIN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX)))
      setColumnWidth(column.id, currentWidth, false)
    }
    const cleanup = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      resizeCleanupRef.current = null
    }
    const onUp = (): void => {
      cleanup()
      if (moved) setColumnWidth(column.id, currentWidth, true)
    }
    resizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function removeColumn(column: HomeTaskColumn): void {
    if (!table || table.columns.length === 1) return
    if (!window.confirm(`删除“${column.label}”列？该列内容也会一并删除。`)) return
    applyTable({
      ...table,
      columns: table.columns.filter((item) => item.id !== column.id),
      rows: table.rows.map((row) => {
        const cells = { ...row.cells }
        delete cells[column.id]
        return { ...row, cells, updatedAt: new Date().toISOString() }
      })
    })
  }

  const visibleRows = useMemo(() => {
    if (!table) return []
    const query = search.trim().toLocaleLowerCase()
    return table.rows.filter((row) => {
      if (query && !Object.values(row.cells).some((value) => value.toLocaleLowerCase().includes(query))) return false
      if (dateFilter && row.cells.date !== dateFilter) return false
      if (statusFilter && row.cells.status !== statusFilter) return false
      return true
    })
  }, [table, search, dateFilter, statusFilter])

  if (!loginState?.isLoggedIn) {
    return (
      <div className="page home-page home-login-page">
        <PageHeader eyebrow="DAILY WORK" title="记录今天，从登录开始。" description="输入账号和密码后进入个人任务表格；每次重新启动 RestX 都需要再次登录。" />
        <section className="home-login-card">
          <div className="home-login-mark"><LockKeyhole size={28} /></div>
          <div className="home-login-copy"><h2>登录首页</h2><p>账号会在下次启动时自动填入，密码需要重新输入。</p></div>
          <form onSubmit={(event) => void submitLogin(event)}>
            <label><span><UserRound size={14} />账号</span><input autoFocus={!account} autoComplete="username" maxLength={320} required value={account} onChange={(event) => setAccount(event.target.value)} placeholder="输入账号" /></label>
            <label><span><LockKeyhole size={14} />密码</span><input autoFocus={Boolean(account)} autoComplete="current-password" maxLength={20_000} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入密码" /></label>
            {loginError ? <div className="home-message error"><AlertCircle size={15} /><span>{loginError}</span></div> : null}
            <button className="button primary large" disabled={loginBusy || !account.trim() || !password} type="submit"><LogIn size={16} />{loginBusy ? '正在保存…' : '登录并进入'}</button>
          </form>
        </section>
      </div>
    )
  }

  const statusColumn = table?.columns.find((column) => column.id === 'status')
  const saveLabel = ({ idle: '尚无修改', pending: '等待保存', saving: '正在保存…', saved: '已自动保存', failed: '保存失败' } as const)[saveStatus]

  return (
    <div className="page home-page home-task-page">
      <PageHeader eyebrow="DAILY WORK" title="每日任务" description={`当前账号：${loginState.account}`} actions={<div className={`home-save-state ${saveStatus}`}><span />{saveLabel}</div>} />

      {loginState.callbackStatus === 'running' ? <div className="home-message info">正在执行登录后的操作…</div> : null}
      {loginState.callbackStatus === 'failed' ? <div className="home-message error"><AlertCircle size={15} /><span>{loginState.callbackError}</span></div> : null}
      {tableError ? <div className="home-message error"><AlertCircle size={15} /><span>{tableError}</span>{!table ? <button className="button compact" type="button" onClick={() => void loadTable()}>重试</button> : null}</div> : null}

      <section className="home-task-toolbar">
        <div className="home-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索全部任务" /></div>
        {table?.columns.some((column) => column.id === 'date') ? <label className="home-filter"><CalendarDays size={15} /><input aria-label="按日期筛选" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label> : null}
        {statusColumn ? <select className="home-filter-select" aria-label="按状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">全部状态</option>{statusColumn.options?.map((option) => <option key={option}>{option}</option>)}</select> : null}
        <div className="home-toolbar-spacer" />
        <button className="button secondary" disabled={!table || table.columns.length >= 40} type="button" onClick={addColumn}><Columns3 size={15} />新增列</button>
        <button className="button primary" disabled={!table} type="button" onClick={() => table && applyTable({ ...table, rows: [...table.rows, newRow(table.columns)] })}><Plus size={15} />新增任务</button>
      </section>

      {table ? (
        <section className="home-table-card">
          <div className="home-table-scroll">
            <table className="home-task-table" style={{ width: table.columns.reduce((sum, column) => sum + columnWidth(column), 58) }}>
              <colgroup>{table.columns.map((column) => <col key={column.id} style={{ width: columnWidth(column) }} />)}<col style={{ width: 58 }} /></colgroup>
              <thead><tr>{table.columns.map((column) => <th key={column.id}><div className="home-column-head"><input aria-label={`列名：${column.label}`} maxLength={80} value={column.label} onChange={(event) => renameColumn(column.id, event.target.value)} /><button aria-label={`删除${column.label}列`} disabled={table.columns.length === 1} type="button" onClick={() => removeColumn(column)}><Trash2 size={13} /></button></div><span className="home-column-resize" role="separator" aria-label={`调整${column.label}列宽`} onPointerDown={(event) => beginColumnResize(event, column)} /></th>)}<th className="home-row-actions-head">操作</th></tr></thead>
              <tbody>{visibleRows.map((row) => <tr key={row.id}>{table.columns.map((column) => <td key={column.id}><TaskCell column={column} value={row.cells[column.id] ?? ''} onChange={(value) => updateCell(row.id, column.id, value)} /></td>)}<td className="home-row-actions"><button aria-label="删除任务" type="button" onClick={() => applyTable({ ...table, rows: table.rows.filter((item) => item.id !== row.id) })}><Trash2 size={14} /></button></td></tr>)}</tbody>
            </table>
          </div>
          {visibleRows.length === 0 ? <div className="home-table-empty"><ListTodo size={25} /><strong>{table.rows.length ? '没有符合筛选条件的任务' : '还没有任务'}</strong><span>{table.rows.length ? '调整筛选条件后再试。' : '点击“新增任务”开始记录今天的工作。'}</span></div> : null}
          <footer><span>共 {table.rows.length} 条任务</span>{visibleRows.length !== table.rows.length ? <span>当前显示 {visibleRows.length} 条</span> : null}</footer>
        </section>
      ) : tableError ? null : <section className="home-table-loading">正在读取任务记录…</section>}
    </div>
  )
}

function TaskCell({ column, value, onChange }: { column: HomeTaskColumn; value: string; onChange(value: string): void }): React.JSX.Element {
  if (column.type === 'select') return <select aria-label={column.label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">未设置</option>{column.options?.map((option) => <option key={option}>{option}</option>)}</select>
  if (column.type === 'date') return <input aria-label={column.label} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
  return <textarea aria-label={column.label} rows={1} value={value} onChange={(event) => onChange(event.target.value)} />
}
