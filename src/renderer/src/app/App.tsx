import { Navigate, Route, Routes } from 'react-router-dom'
import { modules } from './modules'
import { AppShell } from './shell/AppShell'

export function App(): React.JSX.Element {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        {modules.map((module) => <Route key={module.id} path={module.route} element={<module.component />} />)}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AppShell>
  )
}
