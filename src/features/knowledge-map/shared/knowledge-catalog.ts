import type {
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeLabelCatalog,
  KnowledgeProblemSummary,
  KnowledgeVirtualNode
} from './contracts'

function key(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function nodeId(kind: KnowledgeVirtualNode['kind'], value: string): string {
  return `${kind}:${encodeURIComponent(key(value))}`
}

function canonicalValues(problems: KnowledgeProblemSummary[], select: (problem: KnowledgeProblemSummary) => string[]): Map<string, string> {
  const values = new Map<string, string>()
  for (const problem of problems) {
    for (const value of select(problem)) {
      const normalized = key(value)
      if (normalized && !values.has(normalized)) values.set(normalized, value.trim())
    }
  }
  return values
}

function sortedNodes(
  kind: KnowledgeVirtualNode['kind'],
  values: Map<string, string>,
  problems: KnowledgeProblemSummary[],
  includes: (problem: KnowledgeProblemSummary, normalized: string) => boolean
): KnowledgeVirtualNode[] {
  return [...values.entries()].map(([normalized, label]) => ({
    id: nodeId(kind, label),
    kind,
    label,
    problemCount: problems.filter((problem) => includes(problem, normalized)).length
  })).sort((left, right) => left.label.localeCompare(right.label))
}

export function buildKnowledgeGraph(problems: KnowledgeProblemSummary[]): KnowledgeGraph {
  const organized = problems.filter((problem) => problem.status === 'organized' && problem.labels)
  const sceneValues = canonicalValues(organized, (problem) => problem.labels ? [problem.labels.scene] : [])
  const capabilityValues = canonicalValues(organized, (problem) => problem.labels?.capabilities ?? [])
  const knowledgeValues = canonicalValues(organized, (problem) => problem.labels?.knowledge ?? [])
  const edgeMap = new Map<string, KnowledgeGraphEdge>()

  function addEdge(from: string, to: string, kind: KnowledgeGraphEdge['kind']): void {
    const id = `${kind}:${from}->${to}`
    if (!edgeMap.has(id)) edgeMap.set(id, { id, from, to, kind })
  }

  for (const problem of organized) {
    const labels = problem.labels!
    const scene = nodeId('scene', labels.scene)
    const problemNode = `problem:${encodeURIComponent(problem.id)}`
    for (const capabilityLabel of labels.capabilities) {
      const capability = nodeId('capability', capabilityLabel)
      addEdge(scene, capability, 'scene-capability')
      for (const knowledgeLabel of labels.knowledge) {
        const knowledge = nodeId('knowledge', knowledgeLabel)
        addEdge(capability, knowledge, 'capability-knowledge')
        addEdge(knowledge, problemNode, 'knowledge-problem')
      }
    }
  }

  return {
    scenes: sortedNodes('scene', sceneValues, organized, (problem, normalized) => key(problem.labels!.scene) === normalized),
    capabilities: sortedNodes('capability', capabilityValues, organized, (problem, normalized) => problem.labels!.capabilities.some((value) => key(value) === normalized)),
    knowledge: sortedNodes('knowledge', knowledgeValues, organized, (problem, normalized) => problem.labels!.knowledge.some((value) => key(value) === normalized)),
    problems: problems.map((problem) => ({
      id: `problem:${encodeURIComponent(problem.id)}`,
      kind: 'problem' as const,
      label: problem.title,
      problemId: problem.id,
      status: problem.status
    })),
    edges: [...edgeMap.values()]
  }
}

export function buildKnowledgeLabelCatalog(problems: KnowledgeProblemSummary[]): KnowledgeLabelCatalog {
  const graph = buildKnowledgeGraph(problems)
  return {
    scenes: graph.scenes.map((node) => node.label),
    capabilities: graph.capabilities.map((node) => node.label),
    knowledge: graph.knowledge.map((node) => node.label)
  }
}
