import type {
  ApplyKnowledgeEditsInput,
  KnowledgeEditableClassification,
  KnowledgeGraph,
  KnowledgeLabels,
  KnowledgeProblemEdit,
  KnowledgeProblemSummary
} from './contracts'
import { buildKnowledgeGraph } from './knowledge-catalog'

export type KnowledgeDraftEntry = {
  problemId: string
  sourceFingerprint: string
  original: KnowledgeEditableClassification | null
  current: KnowledgeEditableClassification | null
}

export type KnowledgeDraft = Record<string, KnowledgeDraftEntry>

export type KnowledgeLabelKind = 'scene' | 'capability' | 'knowledge'

function normalizedKey(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function normalizedList(values: string[]): string[] {
  const labels = new Map<string, string>()
  for (const value of values) {
    const label = value.trim()
    const key = normalizedKey(label)
    if (key && !labels.has(key)) labels.set(key, label)
  }
  return [...labels.values()]
}

export function normalizeKnowledgeClassification(
  classification: KnowledgeEditableClassification | null
): KnowledgeEditableClassification | null {
  if (!classification) return null
  const scene = classification.scene?.trim() || null
  return {
    scene,
    capabilities: normalizedList(classification.capabilities),
    knowledge: normalizedList(classification.knowledge)
  }
}

function fromLabels(labels: KnowledgeLabels | undefined): KnowledgeEditableClassification | null {
  return labels ? normalizeKnowledgeClassification({
    scene: labels.scene,
    capabilities: labels.capabilities,
    knowledge: labels.knowledge
  }) : null
}

function cloneClassification(
  classification: KnowledgeEditableClassification | null
): KnowledgeEditableClassification | null {
  return classification ? {
    scene: classification.scene,
    capabilities: [...classification.capabilities],
    knowledge: [...classification.knowledge]
  } : null
}

export function createKnowledgeDraft(problems: KnowledgeProblemSummary[]): KnowledgeDraft {
  return Object.fromEntries(problems.map((problem) => {
    const classification = normalizeKnowledgeClassification(problem.classification ?? fromLabels(problem.labels))
    return [problem.id, {
      problemId: problem.id,
      sourceFingerprint: problem.sourceFingerprint,
      original: cloneClassification(classification),
      current: cloneClassification(classification)
    }]
  }))
}

export function updateKnowledgeDraft(
  draft: KnowledgeDraft,
  problemId: string,
  classification: KnowledgeEditableClassification | null
): KnowledgeDraft {
  const entry = draft[problemId]
  if (!entry) return draft
  return {
    ...draft,
    [problemId]: {
      ...entry,
      current: normalizeKnowledgeClassification(classification)
    }
  }
}

export function removeKnowledgeLabel(
  draft: KnowledgeDraft,
  kind: KnowledgeLabelKind,
  label: string
): KnowledgeDraft {
  const target = normalizedKey(label)
  if (!target) return draft
  return Object.fromEntries(Object.entries(draft).map(([problemId, entry]) => {
    const current = entry.current
    if (!current) return [problemId, entry]
    const next: KnowledgeEditableClassification = {
      scene: kind === 'scene' && current.scene && normalizedKey(current.scene) === target ? null : current.scene,
      capabilities: kind === 'capability'
        ? current.capabilities.filter((value) => normalizedKey(value) !== target)
        : [...current.capabilities],
      knowledge: kind === 'knowledge'
        ? current.knowledge.filter((value) => normalizedKey(value) !== target)
        : [...current.knowledge]
    }
    return [problemId, { ...entry, current: next }]
  }))
}

export function countKnowledgeLabelReferences(
  draft: KnowledgeDraft,
  kind: KnowledgeLabelKind,
  label: string
): number {
  const target = normalizedKey(label)
  return Object.values(draft).filter(({ current }) => {
    if (!current) return false
    if (kind === 'scene') return Boolean(current.scene && normalizedKey(current.scene) === target)
    const values = kind === 'capability' ? current.capabilities : current.knowledge
    return values.some((value) => normalizedKey(value) === target)
  }).length
}

function isComplete(classification: KnowledgeEditableClassification | null): classification is KnowledgeEditableClassification & { scene: string } {
  return Boolean(classification?.scene && classification.capabilities.length && classification.knowledge.length)
}

export function buildDraftProblems(
  problems: KnowledgeProblemSummary[],
  draft: KnowledgeDraft
): KnowledgeProblemSummary[] {
  return problems.map((problem) => {
    if (problem.status === 'invalid') return problem
    const classification = draft[problem.id]?.current ?? null
    if (!isComplete(classification)) {
      const next: KnowledgeProblemSummary = {
        ...problem,
        status: 'pending',
        ...(classification ? { classification: cloneClassification(classification)! } : {})
      }
      delete next.labels
      delete next.issue
      if (!classification) delete next.classification
      return next
    }
    return {
      ...problem,
      status: 'organized',
      classification: cloneClassification(classification)!,
      labels: {
        scene: classification.scene,
        capabilities: [...classification.capabilities],
        knowledge: [...classification.knowledge]
      }
    }
  })
}

export function buildKnowledgeDraftGraph(
  problems: KnowledgeProblemSummary[],
  draft: KnowledgeDraft
): KnowledgeGraph {
  return buildKnowledgeGraph(buildDraftProblems(problems, draft))
}

function classificationKey(classification: KnowledgeEditableClassification | null): string {
  const value = normalizeKnowledgeClassification(classification)
  if (!value) return 'null'
  return JSON.stringify({
    scene: value.scene?.toLocaleLowerCase() ?? null,
    capabilities: value.capabilities.map(normalizedKey).sort(),
    knowledge: value.knowledge.map(normalizedKey).sort()
  })
}

export function buildKnowledgeEdits(draft: KnowledgeDraft): ApplyKnowledgeEditsInput {
  const edits: KnowledgeProblemEdit[] = Object.values(draft)
    .filter((entry) => classificationKey(entry.original) !== classificationKey(entry.current))
    .map((entry) => ({
      problemId: entry.problemId,
      sourceFingerprint: entry.sourceFingerprint,
      classification: cloneClassification(entry.current)
    }))
  return { edits }
}
