import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Clipboard, Code2, FileJson2, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react'
import type { ScanCandidate } from '../../shared/contracts/inspector'
import type { JsonlEntryDetail, JsonlEventSummary, JsonlPage } from '../../shared/contracts/jsonl'
import { formatBytes, formatDate } from '../format'

export function JsonlDetail({ candidate, onClose }: { candidate: ScanCandidate; onClose: () => void }): React.JSX.Element {
  const [page, setPage] = useState<JsonlPage | null>(null)
  const [entries, setEntries] = useState<JsonlEventSummary[]>([])
  const [selected, setSelected] = useState<JsonlEntryDetail | null>(null)
  const [selectedOffset, setSelectedOffset] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
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

  useEffect(() => { void loadInitial() }, [candidate.path])

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of entries) for (const tag of entry.tags) counts.set(tag.label, (counts.get(tag.label) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [entries])

  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return entries.filter((entry) =>
      (filter === 'all' || entry.tags.some((tag) => tag.label === filter)) &&
      (!normalized || entry.rawPreview.toLowerCase().includes(normalized) || entry.tags.some((tag) => tag.label.toLowerCase().includes(normalized)))
    )
  }, [entries, filter, query])

  const loadOlder = async (): Promise<void> => {
    if (!page?.olderCursor || !candidate.jsonlProfileId) return
    setStatus('loading')
    try {
      const older = await window.restx.inspector.readJsonlPage({
        path: candidate.path, profileId: candidate.jsonlProfileId,
        cursor: page.olderCursor, snapshotId: page.file.snapshotId, limit: 100
      })
      setEntries((current) => [...older.entries, ...current])
      setPage({ ...older, entries: [...older.entries, ...entries] })
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
        <div className="jsonl-filters">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部 <b>{entries.length}</b></button>
          {availableTags.map(([tag, count]) => <button key={tag} className={filter === tag ? 'active' : ''} onClick={() => setFilter(tag)}>{tag} <b>{count}</b></button>)}
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前已加载记录…" />
      </div>

      {error && <div className="jsonl-error"><AlertTriangle size={13} />{error}<button onClick={() => void loadInitial()}><RefreshCw size={12} />刷新</button></div>}
      <div className="jsonl-browser">
        <section className="jsonl-events" aria-label="JSONL 记录列表">
          {page?.olderCursor && <button className="load-older" disabled={status === 'loading'} onClick={() => void loadOlder()}>{status === 'loading' ? <LoaderCircle className="spin" size={13} /> : null}加载更早记录</button>}
          {status === 'loading' && entries.length === 0 ? <div className="jsonl-placeholder"><LoaderCircle className="spin" size={22} />正在读取文件尾部…</div> : null}
          {status !== 'loading' && visibleEntries.length === 0 ? <div className="jsonl-placeholder">没有匹配的记录</div> : null}
          {visibleEntries.map((entry) => (
            <button key={entry.offset} className={`jsonl-event${selectedOffset === entry.offset ? ' selected' : ''}`} onClick={() => void openEntry(entry)}>
              <span className="jsonl-event-head">
                <span className="jsonl-tags">{entry.tags.map((tag) => <i key={`${tag.tone}-${tag.label}`} className={tag.tone}>{tag.label}</i>)}</span>
                <time>{entry.timestamp ? formatDate(entry.timestamp) : `#${entry.offset}`}</time>
              </span>
              <code>{entry.rawPreview}</code>
            </button>
          ))}
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

function cleanError(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : fallback
}
