import { describe, it, expect } from 'vitest';
import { detectCircularParents } from './relationshipGraph.js';

function graph(edges) {
  return new Map(Object.entries(edges).map(([id, parents]) => [id, { id, rels: { parents } }]));
}

describe('detectCircularParents', () => {
  it('returns no warnings for an acyclic graph', () => {
    const warnings = detectCircularParents(graph({ a: [], b: ['a'], c: ['a', 'b'] }));
    expect(warnings).toEqual([]);
  });

  it('flags a direct two-node cycle once', () => {
    const warnings = detectCircularParents(graph({ a: ['b'], b: ['a'] }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('CIRCULAR_REFERENCE');
  });

  it('flags a longer cycle without duplicate warnings per edge', () => {
    const warnings = detectCircularParents(graph({ a: ['c'], b: ['a'], c: ['b'] }));
    expect(warnings).toHaveLength(1);
  });
});
