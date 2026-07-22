import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

type FeatureBoundaryProps = {
  featureId: string
  children: ReactNode
}

type FeatureBoundaryState = {
  error: Error | null
}

export class FeatureBoundary extends Component<FeatureBoundaryProps, FeatureBoundaryState> {
  state: FeatureBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): FeatureBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[feature:${this.props.featureId}] renderer failure (${error.name}, componentStack=${Boolean(info.componentStack)})`)
  }

  private retry = (): void => window.location.reload()

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <section className="feature-failure" role="alert">
        <AlertTriangle size={28} />
        <h2>这个功能暂时无法显示</h2>
        <p>特性 <code>{this.props.featureId}</code> 发生错误，其他功能仍可继续使用。</p>
        <button className="button" type="button" onClick={this.retry}><RotateCcw size={15} />重试</button>
      </section>
    )
  }
}
