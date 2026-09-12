import { describe, expect, it } from 'vitest';
import { buildAdjacency, descendants, topoSort, wouldCreateCycle } from './graph.js';

describe('graph', () => {
  const edges: Array<[string, string]> = [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
  ];

  it('detects a would-be cycle', () => {
    const adj = buildAdjacency(edges);
    expect(wouldCreateCycle(adj, 'd', 'a')).toBe(true); // d -> a closes a->b->c->d
    expect(wouldCreateCycle(adj, 'a', 'd')).toBe(false); // parallel forward edge is fine
    expect(wouldCreateCycle(adj, 'a', 'a')).toBe(true); // self edge
  });

  it('lists downstream descendants', () => {
    const adj = buildAdjacency(edges);
    expect(descendants(adj, 'b')).toEqual(['c', 'd']);
  });

  it('topologically sorts a DAG and throws on a cycle', () => {
    const adj = buildAdjacency(edges);
    expect(topoSort(['a', 'b', 'c', 'd'], adj)).toEqual(['a', 'b', 'c', 'd']);

    const cyclic = buildAdjacency([...edges, ['d', 'a']]);
    expect(() => topoSort(['a', 'b', 'c', 'd'], cyclic)).toThrow(/cycle/);
  });
});
