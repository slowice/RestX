export type KnowledgeProblemStatus = 'pending' | 'organized' | 'invalid'

export type KnowledgeLabels = {
  scene: string
  capabilities: string[]
  knowledge: string[]
}

export type KnowledgeProblemSummary = {
  id: string
  name: string
  title: string
  status: KnowledgeProblemStatus
  sizeBytes: number
  modifiedAt: string
  sourceFingerprint: string
  labels?: KnowledgeLabels
  issue?: string
}

export type KnowledgeProblemDetail = KnowledgeProblemSummary & {
  markdown: string
}

export type KnowledgeLabelCatalog = {
  scenes: string[]
  capabilities: string[]
  knowledge: string[]
}

export type KnowledgeVirtualNode = {
  id: string
  kind: 'scene' | 'capability' | 'knowledge'
  label: string
  problemCount: number
}

export type KnowledgeProblemNode = {
  id: string
  kind: 'problem'
  label: string
  problemId: string
  status: KnowledgeProblemStatus
}

export type KnowledgeGraphEdge = {
  id: string
  from: string
  to: string
  kind: 'scene-capability' | 'capability-knowledge' | 'knowledge-problem'
}

export type KnowledgeGraph = {
  scenes: KnowledgeVirtualNode[]
  capabilities: KnowledgeVirtualNode[]
  knowledge: KnowledgeVirtualNode[]
  problems: KnowledgeProblemNode[]
  edges: KnowledgeGraphEdge[]
}

export type KnowledgeScanSkip = {
  id: string
  reason: 'symbolic-link' | 'file-too-large' | 'depth-limit' | 'file-limit' | 'read-failed'
}

export type KnowledgeScanResult = {
  rootDisplayPath: string
  scannedAt: string
  problems: KnowledgeProblemSummary[]
  graph: KnowledgeGraph
  catalog: KnowledgeLabelCatalog
  skipped: KnowledgeScanSkip[]
}

export type SuggestedLabel = {
  value: string
  existing: boolean
}

export type KnowledgeClassificationSuggestion = {
  problemId: string
  sourceFingerprint: string
  scene: SuggestedLabel
  capabilities: SuggestedLabel[]
  knowledge: SuggestedLabel[]
}

export type ApplyKnowledgeClassificationInput = {
  problemId: string
  sourceFingerprint: string
  scene: string
  capabilities: string[]
  knowledge: string[]
}

