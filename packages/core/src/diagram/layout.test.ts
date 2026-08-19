import { describe, expect, it } from 'vitest';
import { compileDiagram } from './index.ts';
import { layoutDiagram, measureText, wrapLabel } from './layout.ts';
import { parseDiagram } from './parse.ts';

const layout = (source: string) => layoutDiagram(parseDiagram(source));
const nodeAt = (result: ReturnType<typeof layout>, id: string) => {
  const node = result.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no node ${id}`);
  return node;
};

describe('measureText', () => {
  it('charges a full em for CJK and about half for Latin', () => {
    expect(measureText('中文', 10)).toBe(20);
    expect(measureText('ab', 10)).toBeCloseTo(10.6);
  });
});

describe('wrapLabel', () => {
  it('wraps on spaces when the text has them', () => {
    expect(wrapLabel('one two three four', 10, 40)).toEqual(['one two', 'three', 'four']);
  });

  it('wraps between characters when it does not', () => {
    const lines = wrapLabel('資料擷取與清理', 10, 30);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('資料擷取與清理');
  });

  it('honours an explicit break', () => {
    expect(wrapLabel('one<br/>two', 10, 500)).toEqual(['one', 'two']);
  });

  it('never returns nothing to draw', () => {
    expect(wrapLabel('', 10, 100)).toEqual(['']);
  });
});

describe('layoutDiagram', () => {
  it('puts each step on its own rank, down the page', () => {
    const result = layout('flowchart TD\n A --> B --> C');
    expect(nodeAt(result, 'A').y).toBeLessThan(nodeAt(result, 'B').y);
    expect(nodeAt(result, 'B').y).toBeLessThan(nodeAt(result, 'C').y);
  });

  it('runs left to right when asked, and keeps rows level', () => {
    const result = layout('flowchart LR\n A --> B --> C');
    expect(nodeAt(result, 'A').x).toBeLessThan(nodeAt(result, 'B').x);
    expect(nodeAt(result, 'A').y).toBeCloseTo(nodeAt(result, 'B').y, 0);
  });

  it('places siblings side by side on one rank without overlapping', () => {
    const result = layout('flowchart TD\n A --> B\n A --> C');
    const b = nodeAt(result, 'B');
    const c = nodeAt(result, 'C');
    expect(b.y).toBeCloseTo(c.y, 0);
    const [left, right] = b.x < c.x ? [b, c] : [c, b];
    expect(left.x + left.width).toBeLessThanOrEqual(right.x);
  });

  it('ranks a graph that feeds back on itself instead of giving up', () => {
    const result = layout('flowchart TD\n A --> B --> C\n C --> A');
    expect(result.nodes).toHaveLength(3);
    expect(nodeAt(result, 'A').y).toBeLessThan(nodeAt(result, 'C').y);
  });

  it('sizes the canvas around everything it drew', () => {
    const result = layout('flowchart TD\n A[A rather long label here] --> B');
    for (const node of result.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(result.width);
      expect(node.y + node.height).toBeLessThanOrEqual(result.height);
    }
  });

  it('starts an edge on its source and ends it on its target', () => {
    const result = layout('flowchart TD\n A --> B');
    const [edge] = result.edges;
    const a = nodeAt(result, 'A');
    const b = nodeAt(result, 'B');
    expect(edge.points[0].y).toBeCloseTo(a.y + a.height, 0);
    expect(edge.points[edge.points.length - 1].y).toBeCloseTo(b.y, 0);
  });

  it('grows a diamond so its label clears the slanted edges', () => {
    const result = layout('flowchart TD\n A{Yes or no} --> B[Yes or no]');
    expect(nodeAt(result, 'A').width).toBeGreaterThan(nodeAt(result, 'B').width);
  });
});

describe('compileDiagram', () => {
  it('produces themed SVG sized to the drawing', () => {
    const compiled = compileDiagram('flowchart TD\n A[開始] --> B[結束]');
    expect(compiled.svg.startsWith('<svg')).toBe(true);
    expect(compiled.svg).toContain('var(--od-text)');
    expect(compiled.svg).toContain('var(--od-font-body)');
    expect(compiled.svg).toContain(`viewBox="0 0 ${compiled.width} ${compiled.height}"`);
    expect(compiled.svg).toContain('開始');
  });

  it('escapes label text rather than letting it close a tag', () => {
    const compiled = compileDiagram('flowchart TD\n A["a < b & c"] --> B');
    expect(compiled.svg).toContain('a &lt; b &amp; c');
    expect(compiled.svg).not.toContain('a < b & c');
  });

  it('keeps arrowhead ids apart so two diagrams can share a page', () => {
    const one = compileDiagram('flowchart TD\n A --> B', { idSuffix: 'one' });
    const two = compileDiagram('flowchart TD\n A --> B', { idSuffix: 'two' });
    expect(one.svg).toContain('id="od-arrow-one"');
    expect(two.svg).toContain('id="od-arrow-two"');
  });

  it('draws no arrowhead for an open link', () => {
    expect(compileDiagram('flowchart TD\n A --- B').svg).not.toContain('marker-end');
  });
});
