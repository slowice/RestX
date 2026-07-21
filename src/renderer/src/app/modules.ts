import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Home, FlaskConical, ScanSearch, Settings } from 'lucide-react'
import { HomePage } from '../features/home/HomePage'
import { InspectorPage } from '../features/ai-inspector/InspectorPage'
import { LabPage } from '../features/lab/LabPage'
import { SettingsPage } from '../features/settings/SettingsPage'

export type RestXModule = {
  id: string
  name: string
  route: string
  icon: LucideIcon
  group: 'primary' | 'system' | 'experimental'
  status: 'stable' | 'experimental'
  component: ComponentType
}

export const modules: RestXModule[] = [
  { id: 'home', name: '首页', route: '/home', icon: Home, group: 'primary', status: 'stable', component: HomePage },
  { id: 'ai-inspector', name: 'AI Inspector', route: '/ai-inspector', icon: ScanSearch, group: 'primary', status: 'stable', component: InspectorPage },
  { id: 'lab', name: '实验室', route: '/lab', icon: FlaskConical, group: 'experimental', status: 'experimental', component: LabPage },
  { id: 'settings', name: '设置', route: '/settings', icon: Settings, group: 'system', status: 'stable', component: SettingsPage }
]
