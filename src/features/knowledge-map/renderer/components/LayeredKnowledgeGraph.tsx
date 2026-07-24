import type {
  KnowledgeGraph,
  KnowledgeProblemNode,
  KnowledgeVirtualNode
} from '../../shared/contracts'

type GraphNode = KnowledgeVirtualNode | KnowledgeProblemNode

type Props = {
  graph: KnowledgeGraph
  selectedProblemId: string | null
  onSelectProblem(problemId: string): void
}

const columnX = {
  scene: 92,
  capability: 332,
  knowledge: 572,
  problem: 812
} as const

function positionsFor(nodes: GraphNode[], kind: GraphNode['kind']): Map<string, { x: number; y: number }> {
  return new Map(nodes.map((node, index) => [
    node.id,
    { x: columnX[kind], y: 80 + index * 88 }
  ]))
}

export function LayeredKnowledgeGraph({ graph, selectedProblemId, onSelectProblem }: Props): React.JSX.Element {
  const organizedProblems = graph.problems.filter((problem) => problem.status === 'organized')
  const columns: Array<{ kind: GraphNode['kind']; label: string; nodes: GraphNode[] }> = [
    { kind: 'scene', label: '场景', nodes: graph.scenes },
    { kind: 'capability', label: '能力', nodes: graph.capabilities },
    { kind: 'knowledge', label: '知识', nodes: graph.knowledge },
    { kind: 'problem', label: '问题', nodes: organizedProblems }
  ]
  const position = new Map<string, { x: number; y: number }>()
  for (const column of columns) {
    for (const [id, value] of positionsFor(column.nodes, column.kind)) position.set(id, value)
  }
  const maxRows = Math.max(1, ...columns.map((column) => column.nodes.length))
  const height = Math.max(360, 120 + (maxRows - 1) * 88)
  const visibleEdges = graph.edges.filter((edge) => position.has(edge.from) && position.has(edge.to))

  return (
    <div className="knowledge-graph-scroll">
      <div className="knowledge-graph" style={{ height }} aria-label="场景、能力、知识和问题的分层路径图">
        <div className="knowledge-graph-columns" aria-hidden="true">
          {columns.map((column) => <span key={column.kind} style={{ left: columnX[column.kind] - 82 }}>{column.label}</span>)}
        </div>
        <svg className="knowledge-connections" viewBox={`0 0 920 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="knowledge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L8,4 L0,8 Z" />
            </marker>
          </defs>
          {visibleEdges.map((edge) => {
            const from = position.get(edge.from)!
            const to = position.get(edge.to)!
            const startX = from.x + 83
            const endX = to.x - 83
            const middle = (startX + endX) / 2
            return (
              <path
                key={edge.id}
                d={`M ${startX} ${from.y} C ${middle} ${from.y}, ${middle} ${to.y}, ${endX} ${to.y}`}
                markerEnd="url(#knowledge-arrow)"
              />
            )
          })}
        </svg>
        {columns.flatMap((column) => column.nodes.map((node) => {
          const point = position.get(node.id)!
          const className = `knowledge-node ${node.kind}${node.kind === 'problem' && node.problemId === selectedProblemId ? ' selected' : ''}`
          if (node.kind === 'problem') {
            return (
              <button
                key={node.id}
                type="button"
                className={className}
                style={{ left: point.x - 82, top: point.y - 28 }}
                onClick={() => onSelectProblem(node.problemId)}
              >
                <strong>{node.label}</strong><span>已整理</span>
              </button>
            )
          }
          return (
            <div key={node.id} className={className} style={{ left: point.x - 82, top: point.y - 28 }}>
              <strong>{node.label}</strong><span>{node.problemCount} 个问题</span>
            </div>
          )
        }))}
      </div>
    </div>
  )
}
