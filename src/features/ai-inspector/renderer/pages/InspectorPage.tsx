import { useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  Clipboard,
  FileCode2,
  FileCog,
  FileText,
  Folder,
  FolderOpen,
  History,
  LoaderCircle,
  MessageSquareText,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles
} from 'lucide-react'
import type { CandidateKind, DetectedAiTool, ScanCandidate, ToolFolderNode } from '../../shared/contracts/inspector'
import type { JsonlWorkspaceSearchHit, JsonlWorkspaceSearchResult } from '../../shared/contracts/jsonl'
import type { ConfigDocument } from '../../shared/contracts/config'
import { PageHeader } from '../../../../platform/renderer/components/PageHeader'
import { ConfigDetail } from '../components/ConfigDetail'
import { JsonlDetail } from '../components/JsonlDetail'
import { SmartImportDialog } from '../components/SmartImportDialog'
import { formatBytes, formatDate, formatFullDate, formatRelativeDate } from '../format'
import { useInspectorState } from '../state/InspectorState'
import '../ai-inspector.css'

type Status = 'idle' | 'scanning' | 'complete' | 'error'

const KIND_LABELS: Record<CandidateKind, string> = { config: '配置', instruction: '指令', conversation: '会话', history: '历史', log: '日志' }

export function InspectorPage(): React.JSX.Element {
  const { preferences, lastScan, setLastScan, refreshPreferences } = useInspectorState()
  const initialTool = lastScan?.tools.find((tool) => tool.status === 'detected')?.id ?? null
  const [status, setStatus] = useState<Status>(lastScan ? 'complete' : 'idle')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedToolId, setSelectedToolId] = useState<string | null>(initialTool)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [selectedConfig, setSelectedConfig] = useState<ConfigDocument | null>(null)
  const [selectedJsonl, setSelectedJsonl] = useState<ScanCandidate | null>(null)
  const [selectedJsonlQuery, setSelectedJsonlQuery] = useState('')
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [detailError, setDetailError] = useState('')
  const [showSmartImport, setShowSmartImport] = useState(false)

  const chooseAndScan = async (): Promise<void> => {
    try {
      const directory = await window.restx.inspector.chooseDirectory()
      if (!directory) return
      await refreshPreferences()
      await runScan(directory)
    } catch (scanError) {
      showError(scanError)
    }
  }

  const runScan = async (directory: string): Promise<void> => {
    setStatus('scanning')
    setError('')
    try {
      const result = await window.restx.inspector.scanDirectory(directory)
      setLastScan(result)
      setSelectedToolId(result.tools.find((tool) => tool.status === 'detected')?.id ?? null)
      setSelectedFolderId(null)
      setSelectedWorkspaceId(null)
      setSelectedConfig(null)
      setSelectedJsonl(null)
      setQuery('')
      setStatus('complete')
    } catch (scanError) {
      showError(scanError)
    }
  }

  const showError = (scanError: unknown): void => {
    const message = scanError instanceof Error ? scanError.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '扫描失败，请稍后重试。'
    setError(message)
    setStatus('error')
  }

  const selectedTool = lastScan?.tools.find((tool) => tool.id === selectedToolId && tool.status === 'detected') ?? null
  const selectedFolder = selectedTool?.folders.find((folder) => folder.id === selectedFolderId) ?? null
  const selectedWorkspace = selectedFolder?.children.find((folder) => folder.id === selectedWorkspaceId) ?? null
  const detectedTools = lastScan?.tools.filter((tool) => tool.status === 'detected') ?? []

  const searchedFiles = useMemo(() => {
    if (!lastScan || !query.trim() || selectedWorkspace) return null
    const normalizedQuery = query.trim().toLowerCase()
    const scope = selectedToolId
      ? lastScan.candidates.filter((candidate) => candidate.toolId === selectedToolId)
      : lastScan.candidates
    return scope.filter((candidate) =>
      candidate.name.toLowerCase().includes(normalizedQuery) ||
      candidate.path.toLowerCase().includes(normalizedQuery) ||
      candidate.matchedBy.toLowerCase().includes(normalizedQuery)
    )
  }, [lastScan, query, selectedToolId, selectedWorkspace])

  const openCandidate = async (candidate: ScanCandidate, initialQuery = ''): Promise<void> => {
    if (candidate.viewer === 'jsonl') {
      setSelectedConfig(null)
      setSelectedJsonl(candidate)
      setSelectedJsonlQuery(initialQuery)
      setDetailStatus('idle')
      return
    }
    if (candidate.viewer !== 'config') return
    setSelectedJsonl(null)
    setSelectedJsonlQuery('')
    setDetailStatus('loading')
    setDetailError('')
    try {
      setSelectedConfig(await window.restx.inspector.readConfig(candidate.path))
      setDetailStatus('idle')
    } catch (reason) {
      setSelectedConfig(null)
      setDetailError(reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '无法读取配置文件。')
      setDetailStatus('error')
    }
  }

  const selectTool = (toolId: string | null): void => {
    setSelectedToolId(toolId)
    setSelectedFolderId(null)
    setSelectedWorkspaceId(null)
    setSelectedConfig(null)
    setSelectedJsonl(null)
    setSelectedJsonlQuery('')
    setDetailStatus('idle')
  }

  const selectFolder = (folderId: string | null): void => {
    setSelectedFolderId(folderId)
    setSelectedWorkspaceId(null)
    setSelectedConfig(null)
    setSelectedJsonl(null)
    setSelectedJsonlQuery('')
    setDetailStatus('idle')
  }

  const selectWorkspace = (workspaceId: string | null): void => {
    setSelectedWorkspaceId(workspaceId)
    setQuery('')
    setSelectedConfig(null)
    setSelectedJsonl(null)
    setSelectedJsonlQuery('')
    setDetailStatus('idle')
  }

  return (
    <div className="page inspector-page">
      <PageHeader eyebrow="LOCAL INSPECTION" title="工具扫描" description="识别本机 AI 工具，并按工具与文件夹浏览相关配置和日志。" actions={<>
        <button className="button secondary" type="button" onClick={() => setShowSmartImport(true)}><Sparkles size={16} />智能导入</button>
        <button className="button primary" type="button" onClick={() => void chooseAndScan()} disabled={status === 'scanning'}><FolderOpen size={17} />选择用户目录</button>
      </>} />

      {showSmartImport && <SmartImportDialog initialRootPath={lastScan?.rootPath ?? preferences?.recentDirectory ?? null} onClose={() => setShowSmartImport(false)} onImported={runScan} />}

      {status === 'idle' && <EmptyState recentDirectory={preferences?.recentDirectory ?? null} onScan={runScan} onChoose={chooseAndScan} />}
      {status === 'scanning' && <ScanningState directory={preferences?.recentDirectory ?? ''} />}
      {status === 'error' && <ErrorState message={error} onRetry={() => preferences?.recentDirectory && void runScan(preferences.recentDirectory)} />}
      {status === 'complete' && lastScan && (
        <>
          <section className="scan-summary">
            <div className="summary-path"><div className="success-icon"><Check size={17} /></div><div><strong>扫描完成</strong><span title={lastScan.rootPath}>{lastScan.rootPath}</span></div></div>
            <div><strong>{detectedTools.length}</strong><span>检测到工具</span></div>
            <div><strong>{lastScan.candidates.length}</strong><span>相关文件</span></div>
            <div><strong>{lastScan.scannedFileCount}</strong><span>检查文件</span></div>
            <button className="button ghost" onClick={() => void runScan(lastScan.rootPath)}><RotateCw size={15} />重新扫描</button>
          </section>

          <ToolDiscoveryCards tools={lastScan.tools} rootPath={lastScan.rootPath} selectedToolId={selectedToolId} onSelect={selectTool} />

          <div className="folder-toolbar">
            <FolderBreadcrumb tool={selectedTool} folder={selectedFolder} workspace={selectedWorkspace} onRoot={() => selectTool(null)} onTool={() => selectFolder(null)} onFolder={() => selectWorkspace(null)} />
            {selectedWorkspace
              ? <span className="workspace-search-hint"><Search size={13} />在下方搜索该 Workspace 的全部会话</span>
              : <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={selectedTool ? `搜索 ${selectedTool.displayName}…` : '搜索全部工具…'} /></label>}
          </div>

          {detailStatus === 'error' && <div className="detail-load-error"><AlertTriangle size={15} />{detailError}</div>}
          <div className={`results-workspace ${selectedConfig || selectedJsonl ? 'with-detail' : ''}`}>
            <section className="result-list folder-browser">
              {selectedWorkspace ? (
                <WorkspaceSessionBrowser folder={selectedWorkspace} selectedPath={selectedJsonl?.path ?? null} loading={detailStatus === 'loading'} onOpen={openCandidate} />
              ) : searchedFiles ? (
                searchedFiles.length > 0
                  ? searchedFiles.map((item) => <CandidateRow key={item.path} candidate={item} selected={selectedConfig?.path === item.path || selectedJsonl?.path === item.path} loading={detailStatus === 'loading'} onOpen={openCandidate} />)
                  : <div className="no-results">没有匹配的工具文件</div>
              ) : selectedFolder ? (
                selectedFolder.children.length > 0
                  ? selectedFolder.children.map((folder) => <FolderRow key={folder.id} folder={folder} onOpen={() => selectWorkspace(folder.id)} />)
                  : selectedFolder.files.length > 0
                    ? selectedFolder.files.map((item) => <CandidateRow key={item.path} candidate={item} selected={selectedConfig?.path === item.path || selectedJsonl?.path === item.path} loading={detailStatus === 'loading'} onOpen={openCandidate} />)
                  : <div className="no-results">该文件夹中没有文件</div>
              ) : selectedTool ? (
                selectedTool.folders.length > 0
                  ? selectedTool.folders.map((folder) => <FolderRow key={folder.id} folder={folder} onOpen={() => selectFolder(folder.id)} />)
                  : <div className="no-results">已检测到 {selectedTool.displayName}，但没有找到预置范围内的配置或日志</div>
              ) : detectedTools.length > 0 ? (
                detectedTools.map((tool) => <ToolFolderRow key={tool.id} tool={tool} onOpen={() => selectTool(tool.id)} />)
              ) : lastScan.candidates.length > 0 ? (
                lastScan.candidates.map((item) => <CandidateRow key={item.path} candidate={item} selected={selectedConfig?.path === item.path || selectedJsonl?.path === item.path} loading={detailStatus === 'loading'} onOpen={openCandidate} />)
              ) : <div className="no-results">没有检测到预置 AI 工具，也没有发现通用配置候选</div>}
            </section>
            {selectedConfig && <ConfigDetail document={selectedConfig} onClose={() => setSelectedConfig(null)} />}
            {selectedJsonl && <JsonlDetail candidate={selectedJsonl} initialQuery={selectedJsonlQuery || undefined} onClose={() => setSelectedJsonl(null)} />}
          </div>
          <div className="result-footnote"><ShieldCheck size={14} />会话扫描仅在本地读取文件头部有限记录用于 Workspace 与问题摘要分组；搜索内容不会落盘或发送给模型。 · 扫描于 {formatDate(lastScan.completedAt)}</div>
        </>
      )}
    </div>
  )
}

function ToolDiscoveryCards({ tools, rootPath, selectedToolId, onSelect }: {
  tools: DetectedAiTool[]
  rootPath: string
  selectedToolId: string | null
  onSelect: (toolId: string) => void
}): React.JSX.Element {
  return (
    <section className="tool-discovery">
      <div className="tool-discovery-heading"><div><span>AI TOOLS</span><strong>支持的 AI 工具</strong></div><small>{tools.filter((tool) => tool.status === 'detected').length} / {tools.length} 已检测到</small></div>
      <div className="tool-card-grid">
        {tools.map((tool) => {
          const detected = tool.status === 'detected'
          const evidence = tool.evidence[0]?.path
          const relativeEvidence = evidence ? evidence.slice(rootPath.length).replace(/^[/\\]/, '') : ''
          return (
            <button key={tool.id} className={`tool-card ${detected ? 'detected' : 'undetected'}${selectedToolId === tool.id ? ' selected' : ''}`} disabled={!detected} onClick={() => onSelect(tool.id)}>
              <span className="tool-card-icon"><Bot size={20} /></span>
              <span className="tool-card-copy"><strong>{tool.displayName}</strong><small title={evidence}>{detected ? `~/${relativeEvidence}` : '未发现本地数据'}</small></span>
              <span className="tool-card-state">{detected ? <><Check size={12} />已检测到</> : '未发现'}</span>
              {detected && <span className="tool-card-counts">{tool.counts.config} 配置 · {tool.counts.instruction} 指令 · {tool.counts.conversation} 会话 · {tool.counts.history} 历史 · {tool.counts.log} 日志</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function FolderBreadcrumb({ tool, folder, workspace, onRoot, onTool, onFolder }: {
  tool: DetectedAiTool | null
  folder: ToolFolderNode | null
  workspace: ToolFolderNode | null
  onRoot: () => void
  onTool: () => void
  onFolder: () => void
}): React.JSX.Element {
  return (
    <nav className="folder-breadcrumb" aria-label="文件夹路径">
      <button onClick={onRoot}><Folder size={14} />AI 工具</button>
      {tool && <><ChevronRight size={13} /><button onClick={onTool}>{tool.displayName}</button></>}
      {folder && <><ChevronRight size={13} />{workspace ? <button onClick={onFolder}>{folder.name}</button> : <span>{folder.name}</span>}</>}
      {workspace && <><ChevronRight size={13} /><span>{workspace.name}</span></>}
    </nav>
  )
}

function ToolFolderRow({ tool, onOpen }: { tool: DetectedAiTool; onOpen: () => void }): React.JSX.Element {
  return <FolderBase name={tool.displayName} description={`${tool.counts.config} 个配置 · ${tool.counts.instruction} 个指令 · ${tool.counts.conversation} 个会话 · ${tool.counts.history} 个历史 · ${tool.counts.log} 个日志`} count={tool.folders.length} onOpen={onOpen} />
}

function FolderRow({ folder, onOpen }: { folder: ToolFolderNode; onOpen: () => void }): React.JSX.Element {
  const recent = folder.files[0]?.modifiedAt
  const description = folder.role === 'physical'
    ? `${folder.path ?? '未能从会话中识别路径'}${recent ? ` · 最近 ${formatFullDate(recent)}` : ''}`
    : folder.kind === 'config' ? '模型、服务和权限等配置'
    : folder.kind === 'instruction' ? 'Agent、规则和提示词'
      : folder.kind === 'conversation' ? '对话、思考与工具调用记录'
        : folder.kind === 'history' ? '命令与活动历史' : '运行与调试日志'
  return <FolderBase name={folder.name} description={description} count={folder.files.length} onOpen={onOpen} />
}

function FolderBase({ name, description, count, onOpen }: { name: string; description: string; count: number; onOpen: () => void }): React.JSX.Element {
  return (
    <button className="folder-row" onClick={onOpen}>
      <span className="folder-icon"><Folder size={20} /></span>
      <span className="folder-copy"><strong>{name}</strong><small>{description}</small></span>
      <span className="folder-count">{count} 项</span>
      <ChevronRight size={17} />
    </button>
  )
}

function WorkspaceSessionBrowser({ folder, selectedPath, loading, onOpen }: {
  folder: ToolFolderNode
  selectedPath: string | null
  loading: boolean
  onOpen: (candidate: ScanCandidate, initialQuery?: string) => Promise<void>
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<JsonlWorkspaceSearchResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle')
  const [error, setError] = useState('')
  const candidatesByPath = useMemo(() => new Map(folder.files.map((candidate) => [candidate.path, candidate])), [folder.files])

  const searchWorkspace = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const normalized = query.trim()
    if (!normalized) return
    const files = folder.files.flatMap((candidate) => candidate.jsonlProfileId ? [{ path: candidate.path, profileId: candidate.jsonlProfileId }] : [])
    if (files.length === 0) return
    setStatus('searching')
    setError('')
    try {
      setResult(await window.restx.inspector.searchJsonlWorkspace({ query: normalized, files }))
      setStatus('idle')
    } catch (reason) {
      setResult(null)
      setError(cleanInspectorError(reason, '无法搜索该 Workspace 的会话。'))
      setStatus('error')
    }
  }

  const clearSearch = (): void => {
    setQuery('')
    setResult(null)
    setError('')
    setStatus('idle')
  }

  return (
    <div className="workspace-session-browser">
      <div className="workspace-session-heading">
        <div><span>WORKSPACE SESSIONS</span><strong>{folder.name}</strong><small title={folder.path ?? undefined}>{folder.path ?? '未识别 Workspace 路径'}</small></div>
        <b>{folder.files.length} 个会话</b>
      </div>
      <form className="workspace-session-search" onSubmit={(event) => void searchWorkspace(event)}>
        <Search size={14} />
        <input value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} placeholder="搜索这个 Workspace 中的问题、错误或模型输出…" />
        {result && <button type="button" className="workspace-search-clear" onClick={clearSearch}>返回会话列表</button>}
        <button type="submit" className="button primary compact" disabled={!query.trim() || status === 'searching'}>{status === 'searching' ? <LoaderCircle className="spin" size={13} /> : <Search size={13} />}搜索全部会话</button>
      </form>
      {error && <div className="workspace-search-error"><AlertTriangle size={13} />{error}</div>}
      {result && <div className={`workspace-search-summary${result.truncated ? ' partial' : ''}`}>
        <span>“{result.query}” 找到 <b>{result.hits.length}</b> 条 · 已扫描 {result.scannedFiles}/{result.totalFiles} 个会话、{result.scannedEntries.toLocaleString('zh-CN')} 条记录、{formatBytes(result.scannedBytes)}</span>
        <strong>{result.truncated ? '结果可能不完整' : '搜索完成'}</strong>
      </div>}
      <div className="workspace-session-list">
        {status === 'searching' && !result ? <div className="no-results"><LoaderCircle className="spin" size={18} />正在搜索 Workspace 中的全部会话…</div> : null}
        {result ? (
          result.hits.length > 0
            ? result.hits.map((hit) => {
              const candidate = candidatesByPath.get(hit.file.path)
              return candidate ? <WorkspaceSearchResultRow key={`${hit.file.path}:${hit.entry.offset}`} hit={hit} candidate={candidate} selected={selectedPath === candidate.path} onOpen={() => onOpen(candidate, result.query)} /> : null
            })
            : <div className="no-results">该 Workspace 的会话中没有匹配记录</div>
        ) : status !== 'searching' ? (
          folder.files.map((candidate) => <SessionRow key={candidate.path} candidate={candidate} selected={selectedPath === candidate.path} loading={loading} onOpen={() => onOpen(candidate)} />)
        ) : null}
      </div>
    </div>
  )
}

function SessionRow({ candidate, selected, loading, onOpen }: {
  candidate: ScanCandidate
  selected: boolean
  loading: boolean
  onOpen: () => Promise<void>
}): React.JSX.Element {
  const occurredAt = candidate.session?.startedAt ?? candidate.modifiedAt
  return (
    <article className={`session-row${selected ? ' selected' : ''}`}>
      <span className="session-row-icon"><MessageSquareText size={18} /></span>
      <div className="session-row-copy">
        <strong>{candidate.session?.title ?? '未提取到用户问题'}</strong>
        <span><b>{candidate.session?.sessionId ?? candidate.name}</b><small title={candidate.path}>{candidate.name}</small></span>
      </div>
      <div className="session-row-time"><time>{formatFullDate(occurredAt)}</time><small>{formatRelativeDate(occurredAt)}</small></div>
      <div className="session-row-actions">
        <button className="button compact view-config" disabled={loading} onClick={() => void onOpen()}><MessageSquareText size={13} />浏览会话</button>
        <button className="button compact" onClick={() => void window.restx.inspector.revealInFolder(candidate.path)}><FolderOpen size={13} />定位</button>
      </div>
    </article>
  )
}

function WorkspaceSearchResultRow({ hit, candidate, selected, onOpen }: {
  hit: JsonlWorkspaceSearchHit
  candidate: ScanCandidate
  selected: boolean
  onOpen: () => Promise<void>
}): React.JSX.Element {
  const occurredAt = hit.entry.timestamp ?? hit.file.modifiedAt
  return (
    <article className={`session-row workspace-search-hit${selected ? ' selected' : ''}`}>
      <span className="session-row-icon"><Search size={18} /></span>
      <div className="session-row-copy">
        <strong>{hit.entry.contentPreview ?? hit.entry.rawPreview}</strong>
        <span><b>{candidate.session?.title ?? candidate.session?.sessionId ?? candidate.name}</b><small>{hit.entry.tags.map((tag) => tag.label).join(' · ')}</small></span>
      </div>
      <div className="session-row-time"><time>{formatFullDate(occurredAt)}</time><small>{formatRelativeDate(occurredAt)}</small></div>
      <div className="session-row-actions"><button className="button compact view-config" onClick={() => void onOpen()}><MessageSquareText size={13} />查看所在会话</button></div>
    </article>
  )
}

function EmptyState({ recentDirectory, onScan, onChoose }: { recentDirectory: string | null; onScan: (path: string) => Promise<void>; onChoose: () => Promise<void> }): React.JSX.Element {
  return (
    <section className="inspector-empty">
      <div className="radar"><div /><div /><div /><Search size={30} /></div>
      <span className="pill">READ ONLY</span>
      <h2>扫描用户目录，发现 AI 工具</h2>
      <p>RestX 会优先识别 Codex、Claude Code 和 OpenCode，再按工具文件夹整理相关配置与日志。</p>
      <div className="empty-actions">
        <button className="button primary large" onClick={() => void onChoose()}><FolderOpen size={18} />选择用户目录</button>
        {recentDirectory && <button className="button secondary large" title={recentDirectory} onClick={() => void onScan(recentDirectory)}>扫描最近目录</button>}
      </div>
      <div className="trust-row"><span><Check size={14} />只读访问</span><span><Check size={14} />预置驱动</span><span><Check size={14} />本地处理</span></div>
    </section>
  )
}

function ScanningState({ directory }: { directory: string }): React.JSX.Element {
  return <section className="state-card"><LoaderCircle className="spin" size={34} /><h2>正在识别 AI 工具…</h2><p title={directory}>{directory}</p><div className="progress"><span /></div><small>检测预置目录并收集相关文件元数据</small></section>
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }): React.JSX.Element {
  return <section className="state-card error"><AlertTriangle size={34} /><h2>无法完成扫描</h2><p>{message}</p><button className="button secondary" onClick={onRetry}><RotateCw size={15} />重试</button></section>
}

function CandidateRow({ candidate, selected, loading, onOpen }: { candidate: ScanCandidate; selected: boolean; loading: boolean; onOpen: (candidate: ScanCandidate) => Promise<void> }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const Icon = candidate.kind === 'config' ? FileCog : candidate.kind === 'instruction' ? FileCode2 : candidate.kind === 'conversation' ? MessageSquareText : candidate.kind === 'history' ? History : FileText
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(candidate.path)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }
  return (
    <article className={`candidate-row${selected ? ' selected' : ''}`}>
      <div className={`file-kind-icon ${candidate.kind}`}><Icon size={19} /></div>
      <div className="candidate-name"><strong>{candidate.name}</strong><span title={candidate.path}>{candidate.relativePath ?? candidate.path}</span></div>
      <span className="rule-tag">{candidate.toolId ? KIND_LABELS[candidate.kind] : candidate.matchedBy}</span>
      <div className="candidate-meta"><span>{formatBytes(candidate.sizeBytes)}</span><time>{formatDate(candidate.modifiedAt)}</time></div>
      <button className="icon-button" onClick={() => void copy()} title="复制路径">{copied ? <Check size={16} /> : <Clipboard size={16} />}</button>
      <div className="candidate-actions">
        {candidate.viewer !== 'metadata' && <button className="button compact view-config" disabled={loading} onClick={() => void onOpen(candidate)}>{loading && !selected ? <LoaderCircle className="spin" size={13} /> : candidate.viewer === 'jsonl' ? <MessageSquareText size={13} /> : <FileCog size={13} />}{candidate.viewer === 'jsonl' ? '浏览记录' : '查看'}</button>}
        <button className="button compact" onClick={() => void window.restx.inspector.revealInFolder(candidate.path)}><FolderOpen size={14} />定位</button>
      </div>
    </article>
  )
}

function cleanInspectorError(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : fallback
}
