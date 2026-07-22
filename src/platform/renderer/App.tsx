import { createElement, lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { FeatureBoundary } from './FeatureBoundary'
import { defaultFeatureRoute, rendererFeatures } from './feature-registry'
import { AppShell } from './shell/AppShell'

const pages = new Map(rendererFeatures.map((feature) => [feature.id, lazy(feature.route.load)]))

export function App(): React.JSX.Element {
  const application = (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to={defaultFeatureRoute} replace />} />
        {rendererFeatures.map((feature) => {
          const Page = pages.get(feature.id)!
          return (
            <Route
              key={feature.id}
              path={feature.route.path}
              element={<FeatureBoundary featureId={feature.id}><Suspense fallback={<FeatureLoading />}><Page /></Suspense></FeatureBoundary>}
            />
          )
        })}
        <Route path="*" element={<Navigate to={defaultFeatureRoute} replace />} />
      </Routes>
    </AppShell>
  )
  return <>{withFeatureProviders(application)}</>
}

function withFeatureProviders(children: ReactNode): ReactNode {
  return rendererFeatures.reduceRight<ReactNode>((content, feature) => (
    feature.Provider ? createElement(feature.Provider, null, content) : content
  ), children)
}

function FeatureLoading(): React.JSX.Element {
  return <section className="feature-loading" aria-live="polite">正在加载功能…</section>
}
