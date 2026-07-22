import type { ReactNode } from 'react'

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }): React.JSX.Element {
  return (
    <header className="page-header">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  )
}
