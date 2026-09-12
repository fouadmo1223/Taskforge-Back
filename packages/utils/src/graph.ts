/**
 * Directed-graph helpers used by task dependencies and subtask hierarchy to keep
 * the structure acyclic. Edges are expressed as an adjacency map.
 */
export type AdjacencyMap = Map<string, Set<string>>;

export function buildAdjacency(edges: Array<readonly [string, string]>): AdjacencyMap {
  const map: AdjacencyMap = new Map();
  for (const [from, to] of edges) {
    if (!map.has(from)) map.set(from, new Set());
    map.get(from)!.add(to);
  }
  return map;
}

/**
 * Returns `true` if adding edge `from -> to` would create a cycle, i.e. `to` can
 * already reach `from` through the existing edges.
 */
export function wouldCreateCycle(adjacency: AdjacencyMap, from: string, to: string): boolean {
  if (from === to) return true;
  const stack = [to];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === from) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of adjacency.get(node) ?? []) stack.push(next);
  }
  return false;
}

/** All nodes reachable from `start` (excluding `start`), in BFS order. */
export function descendants(adjacency: AdjacencyMap, start: string): string[] {
  const out: string[] = [];
  const queue = [...(adjacency.get(start) ?? [])];
  const seen = new Set<string>(queue);
  while (queue.length > 0) {
    const node = queue.shift()!;
    out.push(node);
    for (const next of adjacency.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return out;
}

/**
 * Topological order (Kahn). Throws if the graph has a cycle — callers that only
 * want detection should use {@link wouldCreateCycle} first.
 */
export function topoSort(nodes: Iterable<string>, adjacency: AdjacencyMap): string[] {
  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n, indegree.get(n) ?? 0);
  for (const [, tos] of adjacency) {
    for (const to of tos) indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }
  const queue = [...indegree].filter(([, d]) => d === 0).map(([n]) => n);
  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length !== indegree.size) throw new Error('graph: cycle detected');
  return order;
}
