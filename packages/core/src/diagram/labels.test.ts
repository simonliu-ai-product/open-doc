import { describe, expect, it } from 'vitest';
import { layoutDiagram, pointAlong } from './layout.ts';
import { parseDiagram } from './parse.ts';

describe('pointAlong', () => {
  it('walks the polyline by length, not by vertex', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 90, y: 10 },
    ];
    expect(pointAlong(line, 0.5)).toEqual({ x: 40, y: 10 });
    expect(pointAlong(line, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(line, 1)).toEqual({ x: 90, y: 10 });
  });
});

describe('edge labels', () => {
  it('keeps two labels off each other when both leave the same node', () => {
    const result = layoutDiagram(
      parseDiagram('flowchart TD\n Gate{選擇} -->|通過| Ok[繼續]\n Gate -.->|失敗| No[拒絕]'),
    );
    const [a, b] = result.edges.map((e) => e.labelAt);
    if (!a || !b) throw new Error('both edges should carry a label');

    // Boxes are ~13px tall; anything closer than that reads as overlapping.
    const apart = Math.abs(a.x - b.x) > 40 || Math.abs(a.y - b.y) > 13;
    expect(apart).toBe(true);
  });

  it('leaves an unlabelled edge without a label point', () => {
    const result = layoutDiagram(parseDiagram('flowchart TD\n A --> B'));
    expect(result.edges[0].labelAt).toBeNull();
  });

  it('keeps a lone label at the centre of its line', () => {
    const result = layoutDiagram(parseDiagram('flowchart TD\n A -->|only| B'));
    const label = result.edges[0].labelAt;
    const centre = pointAlong(result.edges[0].points, 0.5);
    expect(label).toEqual(centre);
  });
});
