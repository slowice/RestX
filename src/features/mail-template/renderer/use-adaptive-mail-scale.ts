import { useCallback, useEffect, useState, type RefCallback } from 'react'

const MIN_SCALE = 0.6

export function calculateAdaptiveScale(availableWidth: number, contentWidth: number, hasTable: boolean): number {
  if (!hasTable || availableWidth <= 0 || contentWidth <= 0) return 1
  const fitted = Math.floor((availableWidth / contentWidth) * 100) / 100
  return Math.max(MIN_SCALE, Math.min(1, fitted))
}

type AdaptiveMailScale = {
  viewportRef: RefCallback<HTMLDivElement>
  contentRef: RefCallback<HTMLDivElement>
  scale: number
}

export function useAdaptiveMailScale(enabled: boolean, layoutKey: string): AdaptiveMailScale {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const viewportRef = useCallback((node: HTMLDivElement | null) => setViewport(node), [])
  const contentRef = useCallback((node: HTMLDivElement | null) => setContent(node), [])

  useEffect(() => {
    if (!viewport || !content) return

    let measureTimer = 0
    const measure = (): void => {
      if (measureTimer) return
      measureTimer = window.setTimeout(() => {
        measureTimer = 0
        const tables = Array.from(content.querySelectorAll<HTMLElement>('table'))
        const widestTable = tables.reduce((widest, table) => Math.max(widest, table.scrollWidth, table.offsetWidth), 0)
        const body = content.querySelector<HTMLElement>('.rich-mail-content, .preview-body') ?? content
        const styles = getComputedStyle(body)
        const horizontalPadding = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0)
        const next = enabled
          ? calculateAdaptiveScale(Math.max(0, viewport.clientWidth - horizontalPadding), widestTable, tables.length > 0)
          : 1
        setScale((current) => current === next ? current : next)
      })
    }

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(measure)
    resizeObserver?.observe(viewport)
    mutationObserver?.observe(content, { attributes: true, characterData: true, childList: true, subtree: true })
    window.addEventListener('resize', measure)
    measure()
    const settleTimer = window.setTimeout(measure, 80)

    return () => {
      window.clearTimeout(settleTimer)
      window.clearTimeout(measureTimer)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [content, enabled, layoutKey, viewport])

  return { viewportRef, contentRef, scale }
}
