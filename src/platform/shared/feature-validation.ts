import type { ChannelDefinition, FeatureDefinition } from './feature-types'

const FEATURE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CAPABILITY_ID_PATTERN = /^[a-z0-9]+(?:[.:/-][a-z0-9]+)*$/

export type FeatureValidationOptions<T extends FeatureDefinition> = {
  getRoute?: (feature: T) => string | undefined
}

export function validateFeatureDefinitions<T extends FeatureDefinition>(
  features: readonly T[],
  options: FeatureValidationOptions<T> = {}
): readonly T[] {
  const ids = new Set<string>()
  const routes = new Map<string, string>()
  const capabilityOwners = new Map<string, string>()

  for (const feature of features) {
    if (!FEATURE_ID_PATTERN.test(feature.id)) throw new Error(`特性 id 无效：${feature.id}`)
    if (ids.has(feature.id)) throw new Error(`特性 id 重复：${feature.id}`)
    ids.add(feature.id)

    const route = options.getRoute?.(feature)
    if (route) {
      if (!route.startsWith('/')) throw new Error(`特性路由必须以 / 开头：${feature.id}/${route}`)
      const owner = routes.get(route)
      if (owner) throw new Error(`特性路由重复：${route}（${owner}、${feature.id}）`)
      routes.set(route, feature.id)
    }

    for (const capability of feature.provides ?? []) {
      assertCapabilityId(capability, feature.id)
      const owner = capabilityOwners.get(capability)
      if (owner) throw new Error(`特性 capability 重复：${capability}（${owner}、${feature.id}）`)
      capabilityOwners.set(capability, feature.id)
    }
    for (const capability of feature.requires ?? []) assertCapabilityId(capability, feature.id)
  }

  const edges = new Map<string, Set<string>>()
  for (const feature of features) {
    const dependencies = new Set<string>()
    for (const capability of feature.requires ?? []) {
      const owner = capabilityOwners.get(capability)
      if (!owner) throw new Error(`特性 ${feature.id} 缺少 capability：${capability}`)
      if (owner !== feature.id) dependencies.add(owner)
    }
    edges.set(feature.id, dependencies)
  }
  assertAcyclic(edges)
  return features
}

export function validateUniqueChannels(features: readonly ChannelDefinition[]): void {
  const owners = new Map<string, string>()
  for (const feature of features) {
    for (const channel of feature.channels) {
      if (!channel || !channel.startsWith(`${feature.id === 'platform' ? 'platform' : `feature:${feature.id}`}:`)) {
        throw new Error(`IPC channel 未使用特性命名空间：${feature.id}/${channel}`)
      }
      const owner = owners.get(channel)
      if (owner) throw new Error(`IPC channel 重复：${channel}（${owner}、${feature.id}）`)
      owners.set(channel, feature.id)
    }
  }
}

function assertCapabilityId(capability: string, featureId: string): void {
  if (!CAPABILITY_ID_PATTERN.test(capability)) throw new Error(`特性 capability 无效：${featureId}/${capability}`)
}

function assertAcyclic(edges: ReadonlyMap<string, ReadonlySet<string>>): void {
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const path: string[] = []

  const visit = (id: string): void => {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      const start = path.indexOf(id)
      throw new Error(`特性依赖存在循环：${[...path.slice(start), id].join(' -> ')}`)
    }
    visiting.add(id)
    path.push(id)
    for (const dependency of edges.get(id) ?? []) visit(dependency)
    path.pop()
    visiting.delete(id)
    visited.add(id)
  }

  for (const id of edges.keys()) visit(id)
}
