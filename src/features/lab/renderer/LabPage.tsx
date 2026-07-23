import { FlaskConical, LockKeyhole, Sparkles } from 'lucide-react'
import { PageHeader } from '../../../platform/renderer/components/PageHeader'
import './lab.css'

export function LabPage(): React.JSX.Element {
  return <div className="page"><PageHeader eyebrow="EXPERIMENTAL" title="实验室" description="未来的新能力会先在这里安全试用。" /><section className="lab-card"><div className="lab-art"><FlaskConical size={42} /><Sparkles size={18} /></div><span className="pill">COMING LATER</span><h2>实验台正在搭建</h2><p>第一阶段只专注于工具扫描的本地扫描闭环。配置解释、日志摘要和自动化工具将在完成权限与审计设计后进入这里。</p><div className="locked-feature"><LockKeyhole size={16} /><span><strong>智能配置解释</strong><small>需要显式授权后才会启用</small></span></div></section></div>
}
