import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle, Check, Clipboard, Code2, FileJson2,
  FolderOpen, Layers3, LoaderCircle, RefreshCw, Search, ShieldCheck, X
} from 'lucide-react'
import type { ScanCandidate } from '../../shared/contracts/inspector'
import type { JsonlEntryDetail, JsonlEventSummary, JsonlPage } from '../../shared/contracts/jsonl'
import { formatBytes, formatDate, formatFullDate, formatRelativeDate } from '../format'

export function JsonlDetail({ candidate, initialQuery, onClose }: { candidate: ScanCandidate; initialQuery?: string; onClose: () => void }): React.JSX.Element {
  const [page, setPage] = useState<JsonlPage | null>(null)
  const [entries, setEntries] = useState<JsonlEventSummary[]>([])
  const [selected, setSelected] = useState<JsonlEntryDetail | null>(null)
  const [selectedOffset, setSelectedOffset] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [queryInput, setQueryInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [rawMode, setRawMode] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadInitial = async (): Promise<void> => {
    if (!candidate.jsonlProfileId) return
    setStatus('loading')
    setError('')
    setSelected(null)
    setSelectedOffset(null)
    try {
      const result = await window.restx.inspector.readJsonlPage({ path: candidate.path, profileId: candidate.jsonlProfileId, limit: 100 })
      setPage(result)
      setEntries(result.entries)
      setStatus('ready')
    } catch (reason) {
      setError(cleanError(reason, '无法读取会话记录。'))
      setStatus('error')
    }
  }

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of entries) for (const tag of entry.tags) counts.set(tag.label, (counts.get(tag.label) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [entries])

  const visibleEntries = useMemo(() => entries.filter((entry) =>
    filter === 'all' || entry.tags.some((tag) => tag.label === filter)
  ), [entries, filter])

  const runSearch = async (query: string): Promise<void> => {
    if (!candidate.jsonlProfileId) return
    setStatus('loading')
    setError('')
    setSelected(null)
    setSelectedOffset(null)
    try {
      const result = await window.restx.inspector.readJsonlPage({
        path: candidate.path, profileId: candidate.jsonlProfileId, query, limit: 200
      })
      setPage(result)
      setEntries(result.entries)
      setActiveQuery(result.search?.query ?? query)
      setFilter('all')
      setStatus('ready')
    } catch (reason) {
      setError(cleanError(reason, '无法搜索历史记录。'))
      setStatus('error')
    }
  }

  useEffect(() => {
    setQueryInput(initialQuery ?? '')
    setActiveQuery('')
    setFilter('all')
    if (initialQuery?.trim()) void runSearch(initialQuery.trim())
    else void loadInitial()
  }, [candidate.path, initialQuery])

  const submitSearch = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const query = queryInput.trim()
    if (!query) {
      if (activeQuery) await clearSearch()
      return
    }
    await runSearch(query)
  }

  const clearSearch = async (): Promise<void> => {
    setQueryInput('')
    setActiveQuery('')
    setFilter('all')
    await loadInitial()
  }

  const loadOlder = async (): Promise<void> => {
    if (!page?.olderCursor || !candidate.jsonlProfileId || activeQuery) return
    setStatus('loading')
    try {
      const older = await window.restx.inspector.readJsonlPage({
        path: candidate.path, profileId: candidate.jsonlProfileId,
        cursor: page.olderCursor, snapshotId: page.file.snapshotId, limit: 100
      })
      const combined = [...older.entries, ...entries]
      setEntries(combined)
      setPage({ ...older, entries: combined })
      setStatus('ready')
    } catch (reason) {
      setError(cleanError(reason, '无法加载更早的记录。'))
      setStatus('error')
    }
  }

  const openEntry = async (entry: JsonlEventSummary): Promise<void> => {
    if (!page || !candidate.jsonlProfileId) return
    setSelectedOffset(entry.offset)
    setDetailLoading(true)
    setError('')
    try {
      const detail = await window.restx.inspector.readJsonlEntry({
        path: candidate.path, profileId: candidate.jsonlProfileId,
        offset: entry.offset, byteLength: entry.byteLength, snapshotId: page.file.snapshotId
      })
      setSelected(detail)
    } catch (reason) {
      setSelected(null)
      setError(cleanError(reason, '无法读取该条记录。'))
    } finally {
      setDetailLoading(false)
    }
  }

  const copyDetail = async (): Promise<void> => {
    if (!selected) return
    await navigator.clipboard.writeText(rawMode ? selected.raw : (selected.formatted ?? selected.raw))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <aside className="config-detail jsonl-detail">
      <header className="detail-header">
        <div className="detail-file-icon"><FileJson2 size={18} /></div>
        <div><strong>{candidate.name}</strong><span title={candidate.path}>{candidate.path}</span></div>
        <button className="icon-button" title="关闭" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="detail-meta">
        <span>{formatBytes(page?.file.sizeBytes ?? candidate.sizeBytes)}</span>
        <span>{formatDate(page?.file.modifiedAt ?? candidate.modifiedAt)}</span>
        <span className="redaction-count"><ShieldCheck size={12} />本地按需读取</span>
      </div>

      {page?.changed && <div className="jsonl-change"><AlertTriangle size={13} />文件已更新，列表已按新版本加载。</div>}
      <div className="jsonl-toolbar">
        <form className="jsonl-search" onSubmit={(event) => void submitSearch(event)}>
          <Search size={13} />
          <input value={queryInput} maxLength={200} onChange={(event) => setQueryInput(event.target.value)} placeholder="搜索用户问题、错误或记录内容…" />
          {activeQuery && <button type="button" className="jsonl-search-clear" aria-label="清除搜索" onClick={() => void clearSearch()}><X size={13} /></button>}
          <button type="submit" className="jsonl-search-submit" disabled={status === 'loading' || !queryInput.trim()}>{status === 'loading' && queryInput.trim() ? <LoaderCircle className="spin" size={12} /> : null}搜索当前会话</button>
        </form>
        <div className="jsonl-filters">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部 <b>{entries.length}</b></button>
          {availableTags.map(([tag, count]) => <button key={tag} className={filter === tag ? 'active' : ''} onClick={() => setFilter(tag)}>{tag} <b>{count}</b></button>)}
        </div>
      </div>

      {page?.search && <div className={`jsonl-search-status${page.search.truncated ? ' partial' : ''}`}>
        <Search size={12} />
        <span>“{page.search.query}” 找到 <b>{entries.length}</b> 条，已扫描 {page.search.scannedEntries.toLocaleString('zh-CN')} 条 / {formatBytes(page.search.scannedBytes)}</span>
        {page.search.truncated ? <strong>结果可能不完整</strong> : <strong>已完成</strong>}
      </div>}
      {error && <div className="jsonl-error"><AlertTriangle size={13} />{error}<button onClick={() => activeQuery ? void clearSearch() : void loadInitial()}><RefreshCw size={12} />刷新</button></div>}
      <div className="jsonl-browser">
        <section className="jsonl-events" aria-label="JSONL 记录列表">
          {page?.olderCursor && !activeQuery && <button className="load-older" disabled={status === 'loading'} onClick={() => void loadOlder()}>{status === 'loading' ? <LoaderCircle className="spin" size={13} /> : null}加载更早记录</button>}
          {status === 'loading' && entries.length === 0 ? <div className="jsonl-placeholder"><LoaderCircle className="spin" size={22} />{activeQuery ? '正在搜索完整历史…' : '正在读取文件尾部…'}</div> : null}
          {status !== 'loading' && visibleEntries.length === 0 ? <div className="jsonl-placeholder">{activeQuery ? '完整搜索中没有找到匹配记录' : '没有匹配的记录'}</div> : null}
          {visibleEntries.map((entry) => <EventRow key={entry.offset} entry={entry} selected={selectedOffset === entry.offset} onOpen={openEntry} />)}
        </section>
        <section className="jsonl-entry-detail" aria-label="JSONL 记录详情">
          {detailLoading ? <div className="jsonl-placeholder"><LoaderCircle className="spin" size={22} />格式化记录…</div> : selected ? (
            <>
              <div className="jsonl-detail-head">
                <span><Code2 size={13} />记录详情</span>
                <div className="data-view-toggle"><button className={!rawMode ? 'active' : ''} onClick={() => setRawMode(false)}>格式化</button><button className={rawMode ? 'active' : ''} onClick={() => setRawMode(true)}>原始</button></div>
                <button className="icon-button" title="复制" onClick={() => void copyDetail()}>{copied ? <Check size={14} /> : <Clipboard size={14} />}</button>
              </div>
              {selected.parseError && <div className="jsonl-parse-error"><AlertTriangle size={12} />{selected.parseError}</div>}
              <pre>{rawMode ? selected.raw : (selected.formatted ?? selected.raw)}</pre>
            </>
          ) : <div className="jsonl-placeholder"><FileJson2 size={24} />点击一行，查看格式化后的 JSON</div>}
        </section>
      </div>
    </aside>
  )
}

function EventRow({ entry, selected, onOpen }: { entry: JsonlEventSummary; selected: boolean; onOpen: (entry: JsonlEventSummary) => Promise<void> }): React.JSX.Element {
  return (
    <button className={`jsonl-event${selected ? ' selected' : ''}`} onClick={() => void onOpen(entry)}>
      <span className="jsonl-event-head">
        <span className="jsonl-tags">{entry.tags.map((tag) => <i key={`${tag.tone}-${tag.label}`} className={tag.tone}>{tag.label}</i>)}</span>
        {entry.timestamp ? <span className="jsonl-event-time"><time>{formatFullDate(entry.timestamp)}</time><small>{formatRelativeDate(entry.timestamp)}</small></span> : <span className="jsonl-event-offset">#{entry.offset}</span>}
      </span>
      {entry.contentPreview ? <strong className="jsonl-event-summary">{entry.contentPreview}</strong> : <code>{entry.rawPreview}</code>}
      {(entry.sessionId || entry.workspace) && <span className="jsonl-event-context">
        {entry.sessionId && <small title={entry.sessionId}><Layers3 size={10} />{shortSession(entry.sessionId)}</small>}
        {entry.workspace && <small title={entry.workspace}><FolderOpen size={10} />{workspaceName(entry.workspace)}</small>}
      </span>}
    </button>
  )
}

function shortSession(value: string): string {
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value
}

function workspaceName(value: string): string {
  const normalized = value.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).pop() || value
}

function cleanError(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : fallback
}
