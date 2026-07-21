import { useMemo, useState } from 'react'
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
import type { CandidateKind, DetectedAiTool, ScanCandidate, ToolFolderNode } from '../../../../shared/contracts/inspector'
import type { ConfigDocument } from '../../../../shared/contracts/config'
import { useAppState } from '../../app/AppState'
import { PageHeader } from '../../shared/PageHeader'
import { formatBytes, formatDate } from '../../shared/format'
import { ConfigDetail } from './ConfigDetail'
import { JsonlDetail } from './JsonlDetail'
import { SmartImportDialog } from './SmartImportDialog'

type Status = 'idle' | 'scanning' | 'complete' | 'error'

const KIND_LABELS: Record<CandidateKind, string> = { config: '配置', instruction: '指令', conversation: '会话', history: '历史', log: '日志' }

export function InspectorPage(): React.JSX.Element {
  const { preferences, lastScan, setLastScan, refreshPreferences } = useAppState()
  const initialTool = lastScan?.tools.find((tool) => tool.status === 'detected')?.id ?? null
  const [status, setStatus] = useState<Status>(lastScan ? 'complete' : 'idle')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedToolId, setSelectedToolId] = useState<string | null>(initialTool)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedConfig, setSelectedConfig] = useState<ConfigDocument | null>(null)
  const [selectedJsonl, setSelectedJsonl] = useState<ScanCandidate | null>(null)
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
  const detectedTools = lastScan?.tools.filter((tool) => tool.status === 'detected') ?? []

  const searchedFiles = useMemo(() => {
    if (!lastScan || !query.trim()) return null
    const normalizedQuery = query.trim().toLowerCase()
    const scope = selectedToolId
      ? lastScan.candidates.filter((candidate) => candidate.toolId === selectedToolId)
      : lastScan.candidates
    return scope.filter((candidate) =>
      candidate.name.toLowerCase().includes(normalizedQuery) ||
      candidate.path.toLowerCase().includes(normalizedQuery) ||
      candidate.matchedBy.toLowerCase().includes(normalizedQuery)
    )
  }, [lastScan, query, selectedToolId])

  const openCandidate = async (candidate: ScanCandidate): Promise<void> => {
    if (candidate.viewer === 'jsonl') {
      setSelectedConfig(null)
      setSelectedJsonl(candidate)
      setDetailStatus('idle')
      return
    }
    if (candidate.viewer !== 'config') return
    setSelectedJsonl(null)
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
    setSelectedConfig(null)
    setSelectedJsonl(null)
    setDetailStatus('idle')
  }

  const selectFolder = (folderId: string | null): void => {
    setSelectedFolderId(folderId)
    setSelectedConfig(null)
    setSelectedJsonl(null)
    setDetailStatus('idle')
  }

  return (
    <div className="page inspector-page">
      <PageHeader eyebrow="LOCAL INSPECTION" title="AI Inspector" description="识别本机 AI 工具，并按工具与文件夹浏览相关配置和日志。" actions={<>
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
            <FolderBreadcrumb tool={selectedTool} folder={selectedFolder} onRoot={() => selectTool(null)} onTool={() => selectFolder(null)} />
            <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={selectedTool ? `搜索 ${selectedTool.displayName}…` : '搜索全部工具…'} /></label>
          </div>

          {detailStatus === 'error' && <div className="detail-load-error"><AlertTriangle size={15} />{detailError}</div>}
          <div className={`results-workspace ${selectedConfig || selectedJsonl ? 'with-detail' : ''}`}>
            <section className="result-list folder-browser">
              {searchedFiles ? (
                searchedFiles.length > 0
                  ? searchedFiles.map((item) => <CandidateRow key={item.path} candidate={item} selected={selectedConfig?.path === item.path || selectedJsonl?.path === item.path} loading={detailStatus === 'loading'} onOpen={openCandidate} />)
                  : <div className="no-results">没有匹配的工具文件</div>
              ) : selectedFolder ? (
                selectedFolder.files.length > 0
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
            {selectedJsonl && <JsonlDetail candidate={selectedJsonl} onClose={() => setSelectedJsonl(null)} />}
          </div>
          <div className="result-footnote"><ShieldCheck size={14} />工具检测只读取路径与元数据；配置和会话内容仅在你点击后本地按需读取。 · 扫描于 {formatDate(lastScan.completedAt)}</div>
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

function FolderBreadcrumb({ tool, folder, onRoot, onTool }: {
  tool: DetectedAiTool | null
  folder: ToolFolderNode | null
  onRoot: () => void
  onTool: () => void
}): React.JSX.Element {
  return (
    <nav className="folder-breadcrumb" aria-label="文件夹路径">
      <button onClick={onRoot}><Folder size={14} />AI 工具</button>
      {tool && <><ChevronRight size={13} /><button onClick={onTool}>{tool.displayName}</button></>}
      {folder && <><ChevronRight size={13} /><span>{folder.name}</span></>}
    </nav>
  )
}

function ToolFolderRow({ tool, onOpen }: { tool: DetectedAiTool; onOpen: () => void }): React.JSX.Element {
  return <FolderBase name={tool.displayName} description={`${tool.counts.config} 个配置 · ${tool.counts.instruction} 个指令 · ${tool.counts.conversation} 个会话 · ${tool.counts.history} 个历史 · ${tool.counts.log} 个日志`} count={tool.folders.length} onOpen={onOpen} />
}

function FolderRow({ folder, onOpen }: { folder: ToolFolderNode; onOpen: () => void }): React.JSX.Element {
  const description = folder.kind === 'config' ? '模型、服务和权限等配置'
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
