import type { ReactNode } from 'react'
import { Command, Sparkles } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { modules } from '../modules'

export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  const mainModules = modules.filter((item) => item.group !== 'system')
  const systemModules = modules.filter((item) => item.group === 'system')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={18} /></div>
          <div><strong>RestX</strong><span>AI WORKSTATION</span></div>
        </div>
        <nav className="nav-list">
          <div className="nav-label">工作区</div>
          {mainModules.map((module) => <NavItem key={module.id} module={module} />)}
        </nav>
        <div className="sidebar-bottom">
          <button className="command-entry" type="button" disabled title="命令面板将在后续版本开放">
            <Command size={16} /><span>命令面板</span><kbd>⌘ K</kbd>
          </button>
          {systemModules.map((module) => <NavItem key={module.id} module={module} />)}
          <div className="privacy-note"><span className="status-dot" />本地优先 · 只读访问</div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}

function NavItem({ module }: { module: (typeof modules)[number] }): React.JSX.Element {
  const Icon = module.icon
  return (
    <NavLink to={module.route} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
      <Icon size={18} /><span>{module.name}</span>
      {module.status === 'experimental' && <em>Beta</em>}
    </NavLink>
  )
}
