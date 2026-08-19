# Footnotes, numbering, cross-references, and data

Everything here shares one mechanism: the framework **scans the rendered pages**
and fills in what only the finished layout knows. That is why none of these
numbers are written by hand, and why they are all correct after a page is
inserted in the middle of the document.

The trade is the same one `<TableOfContents>` makes: values are empty on the
first render pass and filled on the next. Both exporters scan their own copy
before serializing, so a PDF never contains a blank number.

## Footnotes

```tsx
import { Footnote } from '@open-document/core';

<p style={p}>
  Spend grew 8% quarter over quarter
  <Footnote>Billing export, 2026-10-02. Excludes the edge tier.</Footnote>, driven
  almost entirely by one service.
</p>
```

- The marker is numbered by position in the document — across fixed pages and
  flow sections alike. Insert a note anywhere and everything after it renumbers.
- Inside a `flow()` section the note prints at the **foot of whatever page its
  marker landed on**, and the space it takes is subtracted from that page's
  budget before the packer decides where to break. You do not reserve anything.
- Give a note an `id` when something needs to point at it: `<Footnote id="src-1">`.

**On a fixed page, add `<Footnotes />` where the notes should print.** A fixed
page is your layout, so the framework does not inject anything into it:

```tsx
const Cover: DocPage = () => (
  <div style={page}>
    <p>Q3 2026<Footnote>Covers the platform tier only.</Footnote></p>
    <Footnotes />
  </div>
);
```

**Put `<Footnote>` in the JSX you hand to `flow()`.** The notes are lifted out of
the blocks before measurement, by walking the element tree you wrote. One hidden
inside a helper component's own body is invisible to that walk and will render
inline instead of at the foot of the page.

## Figures and tables

```tsx
import { Figure } from '@open-document/core';

<Figure id="topology" caption="Service topology, Q3 2026">
  <img src={diagram} alt="Service topology" style={{ width: '100%', display: 'block' }} />
</Figure>
```

- `kind="table"` numbers it with the tables instead, and captions above rather
  than below.
- Content and caption are **one block**, so a flow section never separates them.
- `caption` may carry markup; pass `captionText` as well when it does, so the
  list of figures has plain text to print.

`<ListOfFigures />` and `<ListOfTables />` build the lists, exactly like
`<TableOfContents />` builds the contents.

## Cross-references

```tsx
import { Ref } from '@open-document/core';

<p style={p}>The shape in <Ref to="topology" /> is what the table hides.</p>
```

Renders `Figure 3`, and appends the page — `Figure 3 (p. 12)` — only when the
target sits on another sheet. Force it either way with `showPage`.

**Never write "see Figure 3 on page 12" by hand.** Both numbers move.

A reference to an id nothing declares renders `[?the-id]` on the page and is
reported by `open-doc check` as an error. That is deliberate: a silent blank is
worse than a visible hole.

## What things are called

Numbering is structural; the words around it are the document's own business.

```tsx
export const meta: DocMeta = {
  title: '平台可靠度回顧',
  labels: { figure: '圖', table: '表', onPage: '（第 {page} 頁）' },
};
```

`footnotes` adds a heading above a page's notes; leave it empty for none.

## Data

```tsx
import { DataTable } from '@open-document/core';
import services from './data/services.csv';

<DataTable
  id="service-table"
  caption="Platform tier, Q3 2026"
  rows={services}
  columns={[
    { key: 'service', label: 'Service' },
    { key: 'requests', label: 'Requests', format: 'integer' },
    { key: 'error_rate', label: 'Errors', format: 'percent' },
  ]}
/>
```

- `.csv` and `.tsv` under the document resolve to an array of objects **at build
  time**. Quoted fields, embedded commas and newlines, and CRLF all work; a
  numeric cell becomes a number, an empty cell becomes `null`.
- Data is never fetched at render time, and must not be: the packer measures the
  real DOM to decide where pages break, so anything that arrives a tick later
  arrives after the layout is decided.
- Columns default to the keys of the first row. A column whose values are all
  numbers aligns right and gets `tabular-nums` without being told.
- `format`: `'integer'`, `'number'`, `'percent'`, `'text'`, or your own
  `(value, row) => ReactNode`.
- `caption` numbers the table and prints the caption above it; without one you
  get a plain table.
- `limit` prints the first N rows and says how many were left out — never
  truncate a table silently.

**Retyping numbers into JSX is the thing this replaces.** If the user has the
data in a file, import the file.
