import { ArrowRight, Bot, FileCog, FileText, ScanSearch, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useInspectorState } from '../../ai-inspector/renderer'
import { PageHeader } from '../../../platform/renderer/components/PageHeader'
import './home.css'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function HomePage(): React.JSX.Element {
  const { scanSummary } = useInspectorState()
  return (
    <div className="page home-page">
      <PageHeader eyebrow="GOOD MORNING" title="你的 AI 工具，一目了然。" description="RestX 在本地整理配置与运行日志，帮你快速理解工具状态。" />

      <section className="hero-card">
        <div className="hero-glow" />
        <div className="hero-icon"><ScanSearch size={28} /></div>
        <div className="hero-copy">
          <span className="pill">FIRST STEP</span>
          <h2>{scanSummary ? '继续检查你的工作区' : '从一次安全扫描开始'}</h2>
          <p>选择一个目录，RestX 只读取文件名与元数据，不读取配置内容，也不会修改任何文件。</p>
          <Link className="button primary" to="/ai-inspector">
            打开 AI Inspector <ArrowRight size={16} />
          </Link>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-one"><FileCog size={20} /></div>
          <div className="orbit orbit-two"><FileText size={20} /></div>
          <div className="orbit orbit-three"><Bot size={22} /></div>
          <div className="scan-core"><ScanSearch size={36} /></div>
        </div>
      </section>

      <div className="section-heading"><div><h2>最近活动</h2><p>你的本地扫描记录</p></div></div>
      {scanSummary ? (
        <section className="activity-card">
          <div className="file-kind-icon config"><FileCog size={20} /></div>
          <div className="activity-main"><strong>{scanSummary.rootPath.split(/[\\/]/).at(-1)}</strong><span title={scanSummary.rootPath}>{scanSummary.rootPath}</span></div>
          <div className="activity-stat"><strong>{scanSummary.scannedFileCount}</strong><span>已扫描文件</span></div>
          <div className="activity-stat"><strong>{scanSummary.candidateCount}</strong><span>候选文件</span></div>
          <time>{formatDate(scanSummary.completedAt)}</time>
          <Link className="icon-button" to="/ai-inspector" aria-label="查看扫描结果"><ArrowRight size={17} /></Link>
        </section>
      ) : (
        <section className="empty-inline"><ShieldCheck size={22} /><div><strong>还没有扫描记录</strong><span>首次扫描结果会显示在这里，并且只保留统计信息。</span></div></section>
      )}

      <section className="principles">
        <div><ShieldCheck size={18} /><strong>安全边界</strong><span>文件访问仅在 Electron 主进程发生</span></div>
        <div><FileText size={18} /><strong>只读扫描</strong><span>第一阶段只检查名称、大小与修改时间</span></div>
        <div><Bot size={18} /><strong>AI 默认关闭</strong><span>未经授权不会发送任何本地内容</span></div>
      </section>
    </div>
  )
}
