import type { Edge, Node } from "@xyflow/react";
import type { ApiDiagram, ArchitectureNode, ArchitectureEdge } from "@tecture/shared";

export interface ArchNodeData extends Record<string, unknown> {
  label: string;
  nodeType?: string;
  technology?: string;
  hasSubDiagram: boolean;
  subDiagramId?: string;
  isContainer: boolean;
  hasChildren: boolean;
}

/** Edge styling is resolved at render time (FloatingEdge) from the appearance context. */
export interface ArchEdgeData extends Record<string, unknown> {
  edgeType?: string;
  /** Position of this edge among all edges joining the same two nodes (either direction). */
  parallelIndex: number;
  /** Number of edges joining the same two nodes (either direction). */
  parallelCount: number;
}

export function diagramToFlow(diagram: ApiDiagram): {
  nodes: Node<ArchNodeData>[];
  edges: Edge<ArchEdgeData>[];
} {
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const childCounts = new Map<string, number>();
  for (const n of diagram.nodes) {
    if (n.parentId && nodeIds.has(n.parentId)) {
      childCounts.set(n.parentId, (childCounts.get(n.parentId) ?? 0) + 1);
    }
  }
  const edges = diagram.edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );
  const groups = new Map<string, number>();
  const slots = edges.map((e) => {
    const key = pairKey(e);
    const index = groups.get(key) ?? 0;
    groups.set(key, index + 1);
    return { e, key, index };
  });
  return {
    nodes: diagram.nodes.map((n) => toFlowNode(n, childCounts.has(n.id))),
    edges: slots.map(({ e, key, index }) =>
      toFlowEdge(e, index, groups.get(key) ?? 1),
    ),
  };
}

/** Order-independent key so A→B and B→A share a group. */
function pairKey(e: ArchitectureEdge): string {
  return e.source < e.target
    ? `${e.source}\u0000${e.target}`
    : `${e.target}\u0000${e.source}`;
}

function toFlowNode(n: ArchitectureNode, hasChildren: boolean): Node<ArchNodeData> {
  const isContainer = Boolean(n.meta?.isContainer) || hasChildren;
  const data: ArchNodeData = {
    label: n.label,
    nodeType: n.meta?.type,
    technology: typeof n.meta?.technology === "string" ? n.meta.technology : undefined,
    hasSubDiagram: Boolean(n.subDiagramId),
    subDiagramId: n.subDiagramId ?? undefined,
    isContainer,
    hasChildren,
  };
  const node: Node<ArchNodeData> = {
    id: n.id,
    type: "architecture",
    position: { x: 0, y: 0 },
    data,
  };
  if (n.parentId) {
    node.parentId = n.parentId;
    node.extent = "parent";
  }
  return node;
}

function toFlowEdge(
  e: ArchitectureEdge,
  parallelIndex: number,
  parallelCount: number,
): Edge<ArchEdgeData> {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: "floating",
    label: e.label,
    data: { edgeType: e.meta?.type, parallelIndex, parallelCount },
  };
}
