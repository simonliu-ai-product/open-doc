import { describe, expect, it } from 'vitest';
import { renderDiffReport } from './diff-report.ts';

const PNG = new Uint8Array(24);
new DataView(PNG.buffer).setUint32(16, 794);
new DataView(PNG.buffer).setUint32(20, 1123);

describe('renderDiffReport', () => {
  const html = renderDiffReport({
    docId: 'report',
    title: 'Q3 <Review>',
    since: 'main',
    commit: 'abcdef1234567',
    before: [PNG, PNG],
    after: [PNG, PNG, PNG],
    pages: [
      { status: 'same', before: 1, after: 1, lines: [], boxes: [] },
      {
        status: 'changed',
        before: 2,
        after: 2,
        lines: [
          { op: 'remove', text: 'cost < 5' },
          { op: 'add', text: 'cost < 6' },
        ],
        boxes: [{ x: 79.4, y: 112.3, width: 397, height: 56.15 }],
      },
      { status: 'added', before: null, after: 3, lines: [], boxes: [] },
    ],
  });

  it('summarises and lists the unchanged pages in a line', () => {
    expect(html).toContain('1 changed · 1 added · 1 unchanged');
    expect(html).toContain('Unchanged: p. 1');
    expect(html).toContain('<code>abcdef1</code>');
  });

  it('escapes what came from the document', () => {
    expect(html).toContain('Q3 &lt;Review&gt;');
    expect(html).toContain('cost &lt; 6');
    expect(html).not.toContain('cost < 6');
  });

  it('places marks as shares of the sheet, so they scale with the picture', () => {
    expect(html).toContain('left:10.00%;top:10.00%;width:50.00%;height:5.00%');
  });

  it('shows a new page on its own', () => {
    expect(html).toMatch(/Page 3 <span class="badge added">Added<\/span>/);
  });
});
