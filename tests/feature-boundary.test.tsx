// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeatureBoundary } from '../src/platform/renderer/FeatureBoundary'

function BrokenFeature(): React.JSX.Element {
  throw new Error('broken feature')
}

describe('FeatureBoundary', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('keeps the surrounding shell and unrelated features available', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<div><span>shell alive</span><FeatureBoundary featureId="broken"><BrokenFeature /></FeatureBoundary><span>other alive</span></div>)

    expect(screen.getByText('shell alive')).toBeTruthy()
    expect(screen.getByText('other alive')).toBeTruthy()
    expect(screen.getByText('这个功能暂时无法显示')).toBeTruthy()
  })
})
