# Assets and image placeholders

## Where files live

| Scope | Path | Import |
| --- | --- | --- |
| One document | `docs/<id>/assets/chart.png` | `import chart from './assets/chart.png'` |
| Shared across documents | `assets/logo.svg` (project root) | `import logo from '@assets/logo.svg'` |

Both resolve to a URL string at build time. For a pure-text document, don't create an `assets/` folder at all.

```tsx
import logo from '@assets/logo.svg';
import diagram from './assets/architecture.png';

<img src={logo} alt="Acme" style={{ height: 28 }} />
<img src={diagram} alt="Service topology" style={{ width: 642, display: 'block' }} />
```

Rules:

- Always size images in absolute px, never `%` — a percentage resolves against the page, and the printed result stops matching the screen.
- Set `display: 'block'` on figures so the line-box descender doesn't add a stray few pixels to your vertical budget.
- Prefer SVG for logos, diagrams, and anything with type in it. A raster diagram at page width needs ≥1280px of source to survive print.
- Photos: keep them under ~1600px wide. The PDF export embeds them at full resolution, and a 6000px photo makes a 40MB PDF.
- Every image needs an `alt`. Figures need a caption below at `--od-size-caption`, muted, on the same page as the image.

## `<ImagePlaceholder>`

When a page needs a real image **the user has to provide** — a chart from their data, a product screenshot, a signed diagram — leave a typed placeholder instead of inventing a stand-in:

```tsx
import { ImagePlaceholder } from '@open-document/core';

<ImagePlaceholder hint="Revenue by segment, Q1–Q3 2026 — export from the finance dashboard" height={200} />
```

- The `hint` is what the user reads when replacing it. Name the exact artifact and where it comes from — "chart here" is useless.
- Size it to the space it will occupy so the page's vertical budget stays honest after the real image lands.
- **Do not** use placeholders for decoration or stock-photo filler. If type, a table, or an inline SVG can carry the page, do that instead.
- List every placeholder for the user at hand-off — those are the blockers between the draft and a sendable document.

## Export behavior

- **PDF**: images are embedded. The exporter waits for every `<img>` to finish loading before printing, so a slow asset delays the export rather than producing a blank frame.
- **HTML**: same-origin assets are collected and rewritten to a local `assets/` folder; the download becomes a `.zip` when the document references any. A document with no assets downloads as a single `.html`.
- Remote images (a URL on another origin) are left as-is — they render only while that host is reachable, and they may be missing from the PDF if the fetch is slow. Import files into the project instead.
