# Design system

Every document declares typed design tokens at the top of `index.tsx` and consumes them through CSS variables. The framework injects the variables at the page root, so both the on-screen page and the exported PDF/HTML read the same values.

## The shape

```tsx
import type { DesignSystem } from '@open-document/core';

export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',    // sheet background — keep near-white for print
    text: '#16181d',  // body copy
    muted: '#6b7280',  // captions, footers, secondary cells
    accent: '#1d4ed8', // section numbers, rules, links, chart series
    rule: '#e5e7eb',   // hairlines, table borders, dot leaders
  },
  fonts: {
    heading: '…',
    body: '…',
    mono: '…',
  },
  typeScale: { title: 44, h1: 28, h2: 20, h3: 16, body: 14, caption: 10 },
  margin: 76,   // px inset from the sheet edge
  leading: 1.55, // body line-height multiplier
  radius: 6,
};
```

## Tokens available in CSS

| Token | From |
| --- | --- |
| `var(--od-bg)` `--od-text` `--od-muted` `--od-accent` `--od-rule` | `palette` |
| `var(--od-font-heading)` `--od-font-body` `--od-font-mono` | `fonts` |
| `var(--od-size-title)` `--od-size-h1` `--od-size-h2` `--od-size-h3` `--od-size-body` `--od-size-caption` | `typeScale` |
| `var(--od-margin)` `--od-leading` `--od-radius` | top-level |

Read the tokens through `var(--od-*)` in inline styles. Read `design.typeScale.body` directly only when you need a **number** for arithmetic (e.g. computing a fixed row height).

## Print-specific palette rules

- **Background must be white or near-white.** A dark report burns toner, and most print pipelines drop background colors by default — a dark-mode document silently prints as white-on-white. If the user insists on a dark cover, make the cover page dark and keep body pages light.
- **Body text at least `#333`-dark.** Grey body copy (#666) that looks refined on screen prints washed out.
- **One accent.** Section numbers, rules, chart series, links. Two accents means a color system nobody asked for.
- `rule` should be barely visible — `#e5e7eb` on white. Heavy table borders make a report look like a spreadsheet.
- Anything conveying meaning by color (status cells, chart series) needs a second cue — a label, a shape, a weight — because the report will be printed in mono somewhere.

## Colors outside the shape

Extra colors (status green/amber/red, chart series beyond the accent) stay as plain module constants:

```tsx
const positive = '#15803d';
const warning = '#b45309';
const negative = '#b91c1c';
```

Keep them next to the `design` const so a future edit finds the whole palette in one place.

## Fonts

The default is a system stack — prefer it. A webfont is warranted for a brand face, or for CJK/Thai/Arabic where system coverage differs across machines.

Load it **at module level**, once per document:

```tsx
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&display=swap';

if (typeof document !== 'undefined' && !document.getElementById('od-font-noto-serif-tc')) {
  const link = document.createElement('link');
  link.id = 'od-font-noto-serif-tc';
  link.rel = 'stylesheet';
  link.href = FONT_CSS;
  document.head.appendChild(link);
}
```

- Give the `<link>` a stable `id` and guard on it — every page component mounts separately, and during export all pages mount at once.
- The PDF export waits on `document.fonts.ready`, so a webfont is safe to use — but a CJK family is megabytes; subset it or accept a slow first export.
- Never rely on a font installed only on your machine. If it isn't loaded by the document, it won't be there in the export.
