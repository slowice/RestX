import { describe, expect, it } from 'vitest'
import { calculateAdaptiveScale } from '../src/features/mail-template/renderer/use-adaptive-mail-scale'

describe('adaptive mail display scale', () => {
  it('keeps actual size when there is no table or the table already fits', () => {
    expect(calculateAdaptiveScale(400, 900, false)).toBe(1)
    expect(calculateAdaptiveScale(900, 600, true)).toBe(1)
  })

  it('fits a wide table and rounds down to avoid visual overflow', () => {
    expect(calculateAdaptiveScale(700, 900, true)).toBe(0.77)
  })

  it('clamps extremely wide tables at sixty percent', () => {
    expect(calculateAdaptiveScale(400, 1200, true)).toBe(0.6)
  })
})
