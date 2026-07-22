import { describe, expect, it } from 'vitest'
import { Circle } from 'lucide-react'
import type { RendererFeature } from '../src/platform/renderer/define-feature'
import { createRendererFeatureRegistry } from '../src/platform/renderer/feature-registry'
import { validateFeatureDefinitions, validateUniqueChannels } from '../src/platform/shared/feature-validation'

const EmptyPage = () => null

function rendererFeature(id: string, path = `/${id}`, extra: Partial<RendererFeature> = {}): RendererFeature {
  return {
    id,
    order: 10,
    navigation: { label: id, icon: Circle, group: 'primary' },
    route: { path, load: async () => ({ default: EmptyPage }) },
    ...extra
  }
}

describe('feature platform validation', () => {
  it('rejects duplicate ids and routes', () => {
    expect(() => validateFeatureDefinitions([{ id: 'same' }, { id: 'same' }])).toThrow(/id 重复/)
    expect(() => createRendererFeatureRegistry([rendererFeature('one', '/same'), rendererFeature('two', '/same')])).toThrow(/路由重复/)
  })

  it('rejects missing capabilities and dependency cycles', () => {
    expect(() => validateFeatureDefinitions([{ id: 'consumer', requires: ['missing.api'] }])).toThrow(/缺少 capability/)
    expect(() => validateFeatureDefinitions([
      { id: 'one', provides: ['one.api'], requires: ['two.api'] },
      { id: 'two', provides: ['two.api'], requires: ['one.api'] }
    ])).toThrow(/依赖存在循环/)
  })

  it('rejects duplicate or non-namespaced channels', () => {
    expect(() => validateUniqueChannels([{ id: 'one', channels: ['feature:one:read', 'feature:one:read'] }])).toThrow(/channel 重复/)
    expect(() => validateUniqueChannels([{ id: 'one', channels: ['read'] }])).toThrow(/未使用特性命名空间/)
  })

  it('adds and removes a renderer-only menu feature without shell or router edits', () => {
    const home = rendererFeature('home', '/home')
    const notes = rendererFeature('notes', '/notes')
    const withNotes = createRendererFeatureRegistry([home, notes])
    const withoutNotes = createRendererFeatureRegistry([home])

    expect(withNotes.navigation.map((feature) => feature.id)).toEqual(['home', 'notes'])
    expect(withNotes.features.map((feature) => feature.route.path)).toContain('/notes')
    expect(withoutNotes.navigation.map((feature) => feature.id)).toEqual(['home'])
    expect(withoutNotes.features.map((feature) => feature.route.path)).not.toContain('/notes')
  })
})
