import { describe, expect, it } from 'vitest';
import { blockHints } from './flow-measure';

function element(tagName: string, attrs: Record<string, string> = {}): Element {
  return { tagName, getAttribute: (name: string) => attrs[name] ?? null } as unknown as Element;
}

describe('blockHints', () => {
  it('keeps a heading with what follows unless it says otherwise', () => {
    expect(blockHints(element('H2')).keepWithNext).toBe(true);
    expect(blockHints(element('H5')).keepWithNext).toBe(false);
    expect(blockHints(element('H2', { 'data-od-keep-with-next': 'false' })).keepWithNext).toBe(
      false,
    );
    expect(blockHints(element('P', { 'data-od-keep-with-next': '' })).keepWithNext).toBe(true);
  });

  it('reads keep-with-previous and break-before only when they are declared', () => {
    expect(blockHints(element('P'))).toEqual({
      keepWithNext: false,
      keepWithPrevious: false,
      breakBefore: false,
    });
    expect(
      blockHints(
        element('H1', { 'data-od-break-before': '', 'data-od-keep-with-previous': 'true' }),
      ),
    ).toEqual({ keepWithNext: true, keepWithPrevious: true, breakBefore: true });
    expect(blockHints(null).keepWithNext).toBe(false);
  });
});
