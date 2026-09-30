import { describe, expect, it } from 'vitest';
import { defaultDesign } from '../app/lib/design.ts';
import { applyDesignWrite, mergeDesign, parseDocDesign, serializeDesign } from './design-plugin.ts';

const DOC_WITH_DESIGN = `import type { DesignSystem, DocPage } from '@open-document/core';

export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#111111',
    muted: '#666666',
    accent: '#1d4ed8',
    rule: '#eeeeee',
  },
  fonts: { heading: 'Georgia, serif', body: 'system-ui, sans-serif', mono: 'Menlo, monospace' },
  typeScale: { title: 44, h1: 28, h2: 20, h3: 16, body: 14, caption: 10 },
  margin: 76,
  leading: 1.55,
  radius: 6,
};

const Cover: DocPage = () => <div>hi</div>;
export default [Cover] satisfies DocPage[];
`;

const DOC_WITHOUT_DESIGN = `import type { DocPage } from '@open-document/core';

const Cover: DocPage = () => <div>hi</div>;
export default [Cover] satisfies DocPage[];
`;

describe('parseDocDesign', () => {
  it('reads the literal design object', () => {
    const parsed = parseDocDesign(DOC_WITH_DESIGN);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.design.palette.accent).toBe('#1d4ed8');
    expect(parsed.design.typeScale.body).toBe(14);
    expect(parsed.design.margin).toBe(76);
  });

  it('reports absence without erroring', () => {
    const parsed = parseDocDesign(DOC_WITHOUT_DESIGN);
    expect(parsed).toEqual({ ok: false, exists: false });
  });

  it('refuses an initializer it cannot read back', () => {
    const parsed = parseDocDesign(
      `const base = {};\nexport const design = { ...base, margin: 76 };\n`,
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.exists).toBe(true);
  });

  it('fills missing keys from the defaults', () => {
    const parsed = parseDocDesign(`export const design = { margin: 100 };\n`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.design.margin).toBe(100);
    expect(parsed.design.typeScale.body).toBe(defaultDesign.typeScale.body);
  });
});

describe('mergeDesign', () => {
  it('merges nested patches without dropping siblings', () => {
    const merged = mergeDesign(defaultDesign, { palette: { accent: '#ff0000' } } as never);
    expect(merged.palette.accent).toBe('#ff0000');
    expect(merged.palette.bg).toBe(defaultDesign.palette.bg);
  });

  it('does not mutate the base', () => {
    const before = JSON.stringify(defaultDesign);
    mergeDesign(defaultDesign, { margin: 10 });
    expect(JSON.stringify(defaultDesign)).toBe(before);
  });
});

describe('serializeDesign', () => {
  it('emits a re-parseable literal with single quotes', () => {
    const text = serializeDesign(defaultDesign);
    expect(text.startsWith('{')).toBe(true);
    expect(text).toContain("bg: '#ffffff'");
    const round = parseDocDesign(`export const design = ${text};\n`);
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.design).toEqual(defaultDesign);
  });

  it('escapes quotes inside font stacks', () => {
    const text = serializeDesign({
      ...defaultDesign,
      fonts: { ...defaultDesign.fonts, heading: 'It\'s "quoted"' },
    });
    expect(text).toContain("It\\'s");
  });
});

describe('applyDesignWrite', () => {
  it('replaces the object in place and leaves the rest of the file alone', () => {
    const next = mergeDesign(defaultDesign, { margin: 96 });
    const result = applyDesignWrite(DOC_WITH_DESIGN, next);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(false);
    expect(result.source).toContain('margin: 96');
    expect(result.source).toContain('const Cover: DocPage');
    expect(result.source.match(/export const design/g)).toHaveLength(1);
    const reparsed = parseDocDesign(result.source);
    expect(reparsed.ok && reparsed.design.margin).toBe(96);
  });

  it('creates the const and the type import when the document has none', () => {
    const result = applyDesignWrite(DOC_WITHOUT_DESIGN, defaultDesign);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    // `import type { … }` already covers the new specifier; `type` twice is an error.
    expect(result.source).toContain(
      "import type { DocPage, DesignSystem } from '@open-document/core';",
    );
    expect(result.source).toContain('export const design: DesignSystem = {');
    expect(parseDocDesign(result.source).ok).toBe(true);
  });

  it('marks the specifier as a type in a value import', () => {
    const result = applyDesignWrite(
      `import { flow } from '@open-document/core';\nconst Cover = () => null;\n`,
      defaultDesign,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.source).toContain(
      "import { flow, type DesignSystem } from '@open-document/core';",
    );
  });

  it('extends a list that ends in a trailing comma without doubling it', () => {
    const result = applyDesignWrite(
      `import {\n  flow,\n  Figure,\n} from '@open-document/core';\nconst Cover = () => null;\n`,
      defaultDesign,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.source).toContain('Figure, type DesignSystem,\n}');
    expect(result.source).not.toContain(', ,');
  });

  it('adds an import of its own beside a namespace import', () => {
    const result = applyDesignWrite(
      `import * as od from '@open-document/core';\nconst Cover = () => null;\n`,
      defaultDesign,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.source).toContain("import * as od from '@open-document/core';");
    expect(result.source).toContain("import type { DesignSystem } from '@open-document/core';");
  });

  it('refuses to write into a document with a syntax error', () => {
    const broken = `${DOC_WITH_DESIGN}\nconst Oops = () => (<div>;\n`;
    const result = applyDesignWrite(broken, defaultDesign);
    expect(result).toMatchObject({ ok: false, status: 422 });
  });

  it('adds a core import when the document imports nothing from it', () => {
    const result = applyDesignWrite(`const Cover = () => null;\n`, defaultDesign);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain("import type { DesignSystem } from '@open-document/core';");
  });
});
