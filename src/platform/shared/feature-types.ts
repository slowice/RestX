export type FeatureId = string
export type CapabilityId = string

export type FeatureDefinition = {
  id: FeatureId
  provides?: readonly CapabilityId[]
  requires?: readonly CapabilityId[]
}

export type ChannelDefinition = {
  id: FeatureId
  channels: readonly string[]
}
