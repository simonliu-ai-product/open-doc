import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Checkbox } from './checkbox.tsx';

describe('Checkbox', () => {
  it('draws an empty box, a tick or a cross, named for screen readers', () => {
    const empty = renderToStaticMarkup(<Checkbox />);
    expect(empty).toContain('aria-label="☐"');
    expect(empty).not.toContain('<svg');
    const ticked = renderToStaticMarkup(<Checkbox checked />);
    expect(ticked).toContain('aria-label="☑"');
    expect(ticked).toContain('data-od-checkbox="checked"');
    expect(ticked).toContain('<svg');
    expect(renderToStaticMarkup(<Checkbox checked mark="cross" />)).toContain('aria-label="☒"');
  });
});
