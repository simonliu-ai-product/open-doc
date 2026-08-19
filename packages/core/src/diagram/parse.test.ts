import { describe, expect, it } from 'vitest';
import { DiagramSyntaxError, parseDiagram } from './parse.ts';

describe('parseDiagram', () => {
  it('reads the header direction, defaulting to top-down', () => {
    expect(parseDiagram('flowchart LR\n  A --> B').direction).toBe('LR');
    expect(parseDiagram('graph TD\n  A --> B').direction).toBe('TD');
    expect(parseDiagram('flowchart\n  A --> B').direction).toBe('TD');
  });

  it('draws reversed axes in their natural direction', () => {
    expect(parseDiagram('flowchart RL\n  A --> B').direction).toBe('LR');
    expect(parseDiagram('flowchart BT\n  A --> B').direction).toBe('TD');
  });

  it('reads shapes from their brackets', () => {
    const { nodes } = parseDiagram(
      'flowchart TD\n A[Rect] --> B(Round)\n B --> C([Stadium])\n C --> D{Choice}\n D --> E((Dot))',
    );
    expect(nodes.map((n) => n.shape)).toEqual(['rect', 'round', 'stadium', 'diamond', 'circle']);
    expect(nodes.map((n) => n.label)).toEqual(['Rect', 'Round', 'Stadium', 'Choice', 'Dot']);
  });

  it('falls back to the id when a node carries no label', () => {
    const { nodes } = parseDiagram('flowchart TD\n A --> B');
    expect(nodes.map((n) => n.label)).toEqual(['A', 'B']);
  });

  it('keeps a label declared once, however often the node is mentioned later', () => {
    const { nodes } = parseDiagram('flowchart TD\n A[Start] --> B\n B --> A');
    expect(nodes.find((n) => n.id === 'A')?.label).toBe('Start');
  });

  it('reads every link style, and whether it has a head', () => {
    const { edges } = parseDiagram(
      'flowchart TD\n A --> B\n A --- C\n A -.-> D\n A ==> E\n A -.- F\n A === G',
    );
    expect(edges.map((e) => [e.style, e.arrow])).toEqual([
      ['solid', true],
      ['solid', false],
      ['dashed', true],
      ['thick', true],
      ['dashed', false],
      ['thick', false],
    ]);
  });

  it('reads edge labels', () => {
    const { edges } = parseDiagram('flowchart TD\n A -->|yes| B\n A -->|no| C');
    expect(edges.map((e) => e.label)).toEqual(['yes', 'no']);
  });

  it('expands a chain into consecutive pairs', () => {
    const { edges, nodes } = parseDiagram('flowchart LR\n A --> B --> C');
    expect(nodes).toHaveLength(3);
    expect(edges.map((e) => `${e.from}${e.to}`)).toEqual(['AB', 'BC']);
  });

  it('handles CJK labels and quoted text', () => {
    const { nodes } = parseDiagram('flowchart TD\n A["資料擷取"] --> B[模型訓練]');
    expect(nodes.map((n) => n.label)).toEqual(['資料擷取', '模型訓練']);
  });

  it('ignores comments and blank lines', () => {
    const { nodes, edges } = parseDiagram('flowchart TD\n%% a note\n\n  A --> B %% trailing');
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);
  });

  it('accepts a standalone node declaration', () => {
    const { nodes, edges } = parseDiagram('flowchart TD\n A[Alone]');
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });

  it('refuses a diagram with nothing in it, pointing at a line', () => {
    expect(() => parseDiagram('flowchart TD')).toThrow(DiagramSyntaxError);
    expect(() => parseDiagram('flowchart TD\n  A[unclosed --> B')).toThrow(/line 2/);
  });
});
