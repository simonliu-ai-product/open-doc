import { describe, expect, it } from 'vitest';
import { metricsFor } from './flow-measure';

/** Just what `metricsFor` reads of a block's wrapper. */
function block(inner: { tagName: string; attrs?: Record<string, string> } | null): HTMLElement {
  return {
    firstElementChild: inner && {
      tagName: inner.tagName,
      getAttribute: (name: string) => inner.attrs?.[name] ?? null,
    },
  } as unknown as HTMLElement;
}

describe('metricsFor', () => {
  it('treats a block that renders nothing as plain, not as a page break', () => {
    expect(metricsFor(block(null), 0, 0)).toMatchObject({
      breakBefore: false,
      keepWithNext: false,
      keepWithPrevious: false,
    });
  });

  it('glues a heading to what follows, and reads declared breaks', () => {
    expect(metricsFor(block({ tagName: 'H2' }), 20, 0).keepWithNext).toBe(true);
    expect(
      metricsFor(block({ tagName: 'DIV', attrs: { 'data-od-break-before': '' } }), 20, 0)
        .breakBefore,
    ).toBe(true);
  });
});
