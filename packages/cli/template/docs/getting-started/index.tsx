import {
  Chart,
  DataTable,
  type DesignSystem,
  Diagram,
  type DocEntry,
  type DocMeta,
  type DocPage,
  Figure,
  Footnote,
  flow,
  ListOfFigures,
  ListOfTables,
  Ref,
  TableOfContents,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
import type { CSSProperties, ReactNode } from 'react';
import usage from './data/usage.csv';
import workflow from './workflow.mmd';

export const meta: DocMeta = {
  title: 'Getting started with open-doc',
  subtitle: 'A hands-on guide to writing, editing and exporting documents',
  author: 'open-doc',
  createdAt: '2026-10-01T00:00:00.000Z',
};

export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#16181d',
    muted: '#6b7280',
    accent: '#1d4ed8',
    rule: '#e4e7ec',
  },
  fonts: {
    heading: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    body: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  typeScale: { title: 44, h1: 26, h2: 18, h3: 15, body: 13, caption: 10 },
  margin: 72,
  leading: 1.6,
  radius: 6,
};

const page: CSSProperties = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  padding: 'var(--od-margin)',
  position: 'relative',
};

const h1: CSSProperties = {
  fontSize: 'var(--od-size-h1)',
  fontWeight: 650,
  letterSpacing: '-0.01em',
  margin: '6px 0 12px',
};
const h2: CSSProperties = { fontSize: 'var(--od-size-h2)', fontWeight: 600, margin: '18px 0 8px' };
const p: CSSProperties = { margin: '0 0 10px' };
const list: CSSProperties = { margin: '0 0 10px' };
const cell: CSSProperties = {
  borderBottom: '1px solid var(--od-rule)',
  padding: '5px 8px',
  fontSize: 11.5,
  textAlign: 'left',
  verticalAlign: 'top',
};
const head: CSSProperties = { ...cell, fontWeight: 600, color: 'var(--od-muted)', fontSize: 10.5 };

const Code = ({ children }: { children: string }) => (
  <pre
    style={{
      fontSize: 11,
      lineHeight: 1.55,
      background: '#f6f7f9',
      border: '1px solid var(--od-rule)',
      borderRadius: 'var(--od-radius)',
      padding: '10px 12px',
      margin: '0 0 12px',
      whiteSpace: 'pre-wrap',
    }}
  >
    {children}
  </pre>
);

const Tip = ({ children }: { children: ReactNode }) => (
  <blockquote
    style={{
      margin: '2px 0 12px',
      padding: '8px 12px',
      background: '#eff4ff',
      borderLeft: '3px solid var(--od-accent)',
      color: 'var(--od-text)',
      fontSize: 12,
    }}
  >
    {children}
  </blockquote>
);

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd
    style={{
      fontFamily: 'var(--od-font-mono)',
      fontSize: '0.85em',
      padding: '0 4px',
      border: '1px solid var(--od-rule)',
      borderRadius: 3,
      background: '#f6f7f9',
    }}
  >
    {children}
  </kbd>
);

const Table = ({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', margin: 0 }}>
    <thead>
      <tr>
        {columns.map((column) => (
          <th key={column} style={head}>
            {column}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row, at) => (
        <tr key={at}>
          {row.map((value, column) => (
            <td key={column} style={column === 0 ? { ...cell, whiteSpace: 'nowrap' } : cell}>
              {value}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

const Header = () => (
  <div
    style={{
      position: 'absolute',
      top: 34,
      left: 'var(--od-margin)',
      right: 'var(--od-margin)',
      fontSize: 'var(--od-size-caption)',
      color: 'var(--od-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    }}
  >
    open-doc · user guide
  </div>
);

const Footer = () => (
  <div
    style={{
      position: 'absolute',
      left: 'var(--od-margin)',
      right: 'var(--od-margin)',
      bottom: 36,
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 'var(--od-size-caption)',
      color: 'var(--od-muted)',
      borderTop: '1px solid var(--od-rule)',
      paddingTop: 8,
    }}
  >
    <span>Getting started with open-doc</span>
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {useDocPageNumber()} / {useDocPageCount()}
    </span>
  </div>
);

const Cover: DocPage = () => (
  <div style={{ ...page, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
    <p
      style={{
        fontSize: 12,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--od-accent)',
        margin: '0 0 16px',
      }}
    >
      open-doc · user guide
    </p>
    <h1
      data-od-outline="skip"
      style={{ ...h1, fontSize: 'var(--od-size-title)', lineHeight: 1.1, margin: '0 0 16px' }}
    >
      open-doc user guide
    </h1>
    <p style={{ ...p, fontSize: 15, color: 'var(--od-muted)', maxWidth: 470 }}>
      The complete manual: the viewer, editing on the page, writing documents, data and charts,
      exporting, the command line, and working with a coding agent. Most of what it describes is
      used somewhere in these pages, so you can try it as you read.
    </p>
    <p style={{ ...p, marginTop: 36, fontSize: 11, color: 'var(--od-muted)' }}>
      中文版：getting-started-zh · Delete both once you no longer need them.
    </p>
  </div>
);

const Contents: DocPage = () => (
  <div style={page}>
    <h2 data-od-outline="skip" style={h1}>
      Contents
    </h2>
    <TableOfContents maxLevel={1} />
  </div>
);

const Lists: DocPage = () => (
  <div style={page}>
    <h2 data-od-outline="skip" style={h1}>
      Tables and figures
    </h2>
    <h3 data-od-outline="skip" style={h2}>
      Tables
    </h3>
    <ListOfTables />
    <h3 data-od-outline="skip" style={h2}>
      Figures
    </h3>
    <ListOfFigures />
  </div>
);

const Part = ({ children }: { children: ReactNode }) => (
  <p
    style={{
      margin: '6px 0 4px',
      fontSize: 11,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: 'var(--od-accent)',
      fontWeight: 600,
    }}
  >
    {children}
  </p>
);

const Body = flow(
  <>
    <Part>Part one · Using open-doc</Part>
    <h1 style={h1}>1. What open-doc is</h1>
    <p style={p}>
      open-doc turns React components into print-quality documents — reports, proposals,
      whitepapers, specs. You (or a coding agent) write each document as a TSX file; the framework
      gives every page a real paper sheet, builds the outline and the table of contents, numbers
      figures, tables and footnotes, paginates long content, and exports the result as PDF, Word,
      HTML or images.
    </p>
    <p style={p}>Four ideas carry the whole tool:</p>
    <ul style={list}>
      <li>
        <strong>Workspace</strong> — a folder holding <code>docs/</code> (one folder per document),
        shared <code>assets/</code>, optional <code>themes/</code>, and{' '}
        <code>open-doc.config.ts</code>.
      </li>
      <li>
        <strong>Document</strong> — <code>docs/&lt;id&gt;/index.tsx</code>, which exports{' '}
        <code>meta</code>, an optional <code>design</code>, and its pages.
      </li>
      <li>
        <strong>Pages</strong> — either fixed sheets you lay out yourself (a cover) or a{' '}
        <code>flow()</code> section the framework paginates (the body).
      </li>
      <li>
        <strong>Design</strong> — one object of colours, fonts, sizes and margins that every page
        draws from, so restyling a document is one edit.
      </li>
    </ul>
    <p style={p}>
      It is built to be written by an agent and reviewed by a person. <Ref to="f-workflow" /> shows
      the loop: you ask, the agent writes, you correct on the page, and you export.
    </p>
    <Diagram
      chart={workflow}
      id="f-workflow"
      caption="The open-doc loop: write, view and correct, export"
      width={560}
    />

    <h1 style={h1}>2. Install and set up a workspace</h1>
    <p style={p}>
      You need Node.js 18 or later. Create a workspace with the scaffolder, then start the dev
      server:
    </p>
    <Code>{`npx @open-document/cli init my-docs
cd my-docs
pnpm install          # or npm install
pnpm dev              # open-doc dev → http://localhost:5273`}</Code>
    <p style={p}>A new workspace looks like this:</p>
    <Code>{`my-docs/
  docs/
    getting-started/      ← this guide
    getting-started-zh/   ← the Chinese edition
  assets/                 ← images shared by every document
  themes/                 ← optional house styles (Markdown)
  .agents/skills/         ← instructions for coding agents
  open-doc.config.ts
  package.json`}</Code>
    <p style={p}>
      <code>open-doc.config.ts</code> is optional; every key has a default (
      <Ref to="t-config" />
      ).
    </p>
    <Figure id="t-config" kind="table" caption="open-doc.config.ts options">
      <Table
        columns={['Key', 'Default', 'Purpose']}
        rows={[
          [<code key="a">docsDir</code>, <code key="b">docs</code>, 'Where documents live.'],
          [<code key="a">assetsDir</code>, <code key="b">assets</code>, 'Shared images.'],
          [<code key="a">themesDir</code>, <code key="b">themes</code>, 'Theme documentation.'],
          [<code key="a">port</code>, <code key="b">5273</code>, 'Dev server port.'],
          [
            <code key="a">allowedHosts</code>,
            '—',
            'Hosts the dev server answers to, e.g. behind a tunnel.',
          ],
          [<code key="a">base</code>, <code key="b">/</code>, 'URL prefix for a static build.'],
          [
            <code key="a">home</code>,
            '—',
            "Where the viewer's back arrow goes, when it's mounted inside another site.",
          ],
          [
            <code key="a">build.showDocBrowser</code>,
            <code key="b">true</code>,
            'Include the document list in a static build.',
          ],
          [
            <code key="a">build.allowHtmlExport</code>,
            <code key="b">true</code>,
            'Offer HTML in the Download menu of a static build.',
          ],
        ]}
      />
    </Figure>

    <h1 style={h1}>3. The document browser</h1>
    <p style={p}>
      The home page lists every document, newest first, each with a live thumbnail of its first
      page. The sidebar organises them:
    </p>
    <ul style={list}>
      <li>
        <strong>Folders</strong> — <em>New folder</em> creates one; each folder has an icon and
        colour (<em>Change icon</em>) and can be renamed or deleted. Folders only group documents;
        nothing moves on disk, and the grouping is saved in <code>docs/.folders.json</code>.
      </li>
      <li>
        <strong>Document menu</strong> (the ⋯ on a card) — <em>Rename</em>, <em>Duplicate</em>,{' '}
        <em>Move to</em> a folder (or <em>Unfiled</em>), and <em>Delete</em>.
      </li>
      <li>
        <strong>Themes</strong> — the house styles under <code>themes/</code>, each with its
        description and a demo page.
      </li>
      <li>
        <strong>Assets</strong> — every image in the workspace, with its size, an <em>unused</em>{' '}
        badge when no document imports it, and a ready-to-paste import line.
      </li>
      <li>
        <strong>Language and theme</strong> — the buttons at the foot of the sidebar switch the
        interface between English and 繁體中文, and between light and dark. ⌘K offers both too.
      </li>
    </ul>

    <h1 style={h1}>4. Reading a document</h1>
    <p style={p}>
      Opening a document shows its pages at true size on a canvas. The toolbar (
      <Ref to="t-toolbar" />) is grouped by job: where you are on the left, how you are looking in
      the centre, and what you do to the document on the right.
    </p>
    <Figure id="t-toolbar" kind="table" caption="The viewer toolbar, left to right">
      <Table
        columns={['Control', 'What it does']}
        rows={[
          ['← and title', 'Back to the document list.'],
          [
            'Page field',
            <>
              Type a page number and press <Kbd>Enter</Kbd> to jump there.
            </>,
          ],
          [
            '− 100% + ▾',
            <>
              Zoom. Type a level (e.g. <code>150</code>) into the field, or use ▾ for Fit width, Fit
              page, Actual size and preset sizes (25–200%).
            </>,
          ],
          ['Layout', 'Continuous, two-up (spreads), or a grid of pages.'],
          [
            'Fullscreen',
            <>
              Reading mode; also <Kbd>F</Kbd>.
            </>,
          ],
          ['Search', 'Find text across every page; matches are highlighted in place.'],
          ['Preview / Edit', 'Reading or editing on the page (dev server only).'],
          [
            'Design',
            <>
              The design panel; also <Kbd>D</Kbd> (dev server only).
            </>,
          ],
          ['Download', 'Export all pages, this page, or a custom range (section 16).'],
        ]}
      />
    </Figure>
    <p style={p}>
      The left rail has three tabs. <strong>Pages</strong> shows thumbnails — click one to jump.{' '}
      <strong>Outline</strong> lists the headings with their page numbers. <strong>Assets</strong>{' '}
      manages the images this document and the workspace hold. The layout you choose is remembered
      per document.
    </p>

    <h1 style={h1}>5. Editing on the page</h1>
    <p style={p}>
      With the dev server running, switch to <strong>Edit</strong> and double-click any text: a
      heading, a paragraph, a list item, a table cell, a figure caption, a footnote. You type
      straight into the page. Edits stay pending — a card at the bottom counts them — until you
      save, and saving writes every change back into the document's source file.
    </p>
    <Figure id="t-keys" kind="table" caption="Keys while editing text on the page">
      <Table
        columns={['Keys', 'Action']}
        rows={[
          [<Kbd key="b">⌘B</Kbd>, 'Bold'],
          [<Kbd key="i">⌘I</Kbd>, 'Italic'],
          [<Kbd key="e">⌘E</Kbd>, 'Inline code'],
          [<Kbd key="k">⌘K</Kbd>, 'Add or edit a link'],
          [<Kbd key="c">⌘\</Kbd>, 'Clear formatting'],
          [<Kbd key="n">Shift+Enter</Kbd>, 'Line break within the text'],
          [<Kbd key="esc">Esc</Kbd>, "Undo this field's change and leave it"],
          [<Kbd key="s">⌘S</Kbd>, 'Save every pending edit'],
          [<Kbd key="z">⌘Z / ⇧⌘Z</Kbd>, 'Undo / redo'],
        ]}
      />
    </Figure>
    <p style={p}>
      Selecting text also shows a small formatting toolbar with the same actions. Text that comes
      from data — a row of an imported <code>.csv</code> — isn't edited on the page; the panel names
      the file to change instead.
    </p>
    <h2 style={h2}>Comments for the agent</h2>
    <p style={p}>
      Click an element in Edit mode to open the element panel on the right. Under{' '}
      <em>Comment for the agent</em>, write what you want changed — "make this a table", "shorten to
      two sentences" — and choose <em>Mark comment</em>. The note is stored in the source next to
      the element; ask your agent to <em>apply the comments</em> and it works through them.
    </p>
    <Tip>
      Try it now: switch to Edit, double-click the word <em>Getting</em> on the cover, change it,
      and press <Kbd>⌘S</Kbd>. Then open <code>docs/getting-started/index.tsx</code> — your change
      is in the source.
    </Tip>

    <h1 style={h1}>6. The design panel</h1>
    <p style={p}>
      Press <Kbd>D</Kbd> or choose <strong>Design</strong>. The panel edits the document's{' '}
      <code>design</code> object live — every page redraws as you drag — and saves it to the source
      like a text edit, with undo. <Ref to="t-design" /> lists what it controls; each value reaches
      the page as a CSS variable, so anything you write can use it too.
    </p>
    <Figure id="t-design" kind="table" caption="Design tokens and the CSS variables they set">
      <Table
        columns={['Token', 'CSS variable', 'Used for']}
        rows={[
          [
            'palette.bg / text / muted',
            <code key="v">--od-bg --od-text --od-muted</code>,
            'Paper, body text, secondary text',
          ],
          [
            'palette.accent / rule',
            <code key="v">--od-accent --od-rule</code>,
            'Links, highlights, charts; hairlines',
          ],
          [
            'fonts.heading / body / mono',
            <code key="v">--od-font-heading …</code>,
            'Font stacks, CJK families included',
          ],
          ['typeScale.title … caption', <code key="v">--od-size-h1 …</code>, 'Font sizes in px'],
          [
            'margin · leading · radius',
            <code key="v">--od-margin --od-leading</code>,
            'Page margin, line height, corners',
          ],
        ]}
      />
    </Figure>

    <Part>Part two · Writing documents</Part>
    <h1 style={h1}>7. The document file</h1>
    <p style={p}>A document exports three things from its index.tsx:</p>
    <Code>{`export const meta: DocMeta = {
  title: 'Q3 Reliability Review',
  subtitle: 'Platform tier',
  author: 'Platform engineering',
  pageSize: 'A4',            // 'A4' | 'B4' | 'A3'
  orientation: 'portrait',   // or 'landscape'
  createdAt: '2026-10-01T00:00:00.000Z',
  labels: { figure: '圖', table: '表' },   // optional
};

export const design: DesignSystem = { /* section 6 */ };

export default [Cover, Contents, Body] satisfies DocEntry[];`}</Code>
    <p style={p}>
      Pages are drawn in CSS pixels at 96 dpi on the exact sheet (<Ref to="t-sizes" />
      ), so a layout on screen is the layout on paper. Those three sizes, in either orientation, are
      the only sheets there are.
    </p>
    <Figure id="t-sizes" kind="table" caption="Page sizes (portrait)">
      <Table
        columns={['pageSize', 'Paper', 'CSS px']}
        rows={[
          ['A4', '210 × 297 mm', '794 × 1123'],
          ['B4', '257 × 364 mm (JIS)', '971 × 1376'],
          ['A3', '297 × 420 mm', '1123 × 1587'],
        ]}
      />
    </Figure>

    <h1 style={h1}>8. Fixed pages and flow</h1>
    <p style={p}>
      A component in the page list is one <strong>fixed</strong> sheet: you place everything, and
      nothing moves to another page. Use it for covers, title pages and posters. A{' '}
      <code>flow()</code> section holds continuous content; the framework measures each block in the
      real browser and packs blocks onto as many pages as they need.
    </p>
    <Code>{`import { flow } from '@open-document/core';

const Body = flow(
  <>
    <h1>1. Findings</h1>
    <p>Each direct child of the fragment is one block.</p>
    <Chart … />
  </>,
  { header: Header, footer: Footer, padding: 72 },
);`}</Code>
    <ul style={list}>
      <li>
        <strong>Blocks never split.</strong> A paragraph, a table or a chart lands whole on one
        page. Split a very long table into two blocks if it must span pages.
      </li>
      <li>
        <strong>Header and footer</strong> render on every page of the section, inside the margin
        band; <code>useDocPageNumber()</code> and <code>useDocPageCount()</code> work inside them.
        This guide's running header and footer are built that way.
      </li>
      <li>
        <strong>Padding</strong> overrides the design's margin for one section.
      </li>
    </ul>
    <Figure id="t-keep" kind="table" caption="Rules that steer page breaks">
      <Table
        columns={['Attribute', 'Effect']}
        rows={[
          ['(headings)', 'A heading never ends a page — it moves down with what follows.'],
          [
            <code key="a">data-od-keep-with-next</code>,
            'Keep this block on the same page as the next one.',
          ],
          [
            <code key="a">data-od-keep-with-previous</code>,
            'Keep this block with the one before, e.g. a caption below a figure.',
          ],
          [<code key="a">data-od-break-before</code>, 'Always start a new page here.'],
        ]}
      />
    </Figure>
    <p style={p}>
      Plain elements take the document's design: a bare <code>&lt;h2&gt;</code> is bold at the h2
      size, a <code>&lt;ul&gt;</code> has bullets, a link takes the accent colour. Anything you
      style inline overrides that.
    </p>

    <h1 style={h1}>9. Headings, outline and contents</h1>
    <p style={p}>
      Real <code>h1</code>, <code>h2</code> and <code>h3</code> elements become the outline in the
      left rail, the entries of <code>&lt;TableOfContents /&gt;</code>, and the bookmarks of an
      exported PDF — all three from the same scan, with the page each heading actually landed on.
    </p>
    <ul style={list}>
      <li>
        <code>&lt;TableOfContents maxLevel={'{2}'} /&gt;</code> fills itself in, page numbers
        included; never write a contents list by hand.
      </li>
      <li>
        <code>data-od-outline="skip"</code> keeps a heading out — the cover title, the word
        "Contents".
      </li>
      <li>
        <code>data-od-heading="Short title"</code> sets the text listed for a long heading, and
        makes any element a heading.
      </li>
    </ul>

    <h1 style={h1}>10. Figures, tables and references</h1>
    <p style={p}>
      Wrap a picture or table in <code>&lt;Figure id caption&gt;</code> (add{' '}
      <code>kind="table"</code> for tables) and it is numbered in document order.{' '}
      <code>&lt;Ref to="id" /&gt;</code> prints its label — this guide's references to{' '}
      <Ref to="t-keys" /> and <Ref to="f-chart" /> are live ones — and{' '}
      <code>&lt;ListOfFigures /&gt;</code> and <code>&lt;ListOfTables /&gt;</code> build the lists
      on the contents page. <code>meta.labels</code> renames them, e.g. 圖 and 表.
    </p>

    <h1 style={h1}>11. Footnotes</h1>
    <p style={p}>
      Write <code>&lt;Footnote&gt;…&lt;/Footnote&gt;</code> where the note belongs
      <Footnote>
        Like this one. It prints at the foot of whichever page its marker lands on.
      </Footnote>
      . In a flow section the framework moves the note to the foot of the page its marker lands on
      and reserves the room for it while paginating. On a fixed page, place{' '}
      <code>&lt;Footnotes /&gt;</code> where the notes should print.
    </p>

    <h1 style={h1}>12. Data, tables and charts</h1>
    <p style={p}>
      Numbers belong in files, not retyped into the page. Import a <code>.csv</code> or{' '}
      <code>.tsv</code> and you get an array of rows; numbers stay numbers. Print it with{' '}
      <code>&lt;DataTable&gt;</code> — <Ref to="t-usage" /> is this guide's sample file:
    </p>
    <Code>{`import usage from './data/usage.csv';

<DataTable rows={usage} caption="Usage" columns={[
  { key: 'month', label: 'Month' },
  { key: 'documents', label: 'Documents', format: 'integer' },
]} />`}</Code>
    <DataTable
      id="t-usage"
      caption="data/usage.csv, printed with DataTable"
      rows={usage}
      columns={[
        { key: 'month', label: 'Month' },
        { key: 'documents', label: 'Documents', format: 'integer' },
        { key: 'exports', label: 'Exports', format: 'integer' },
      ]}
    />
    <p style={p}>
      <code>columns</code> picks, labels, aligns and formats columns (<code>number</code>,{' '}
      <code>integer</code>, <code>percent</code>, or a function); <code>limit</code> caps the rows;{' '}
      <code>compact</code> tightens them. The same rows drawn with <code>&lt;Chart&gt;</code>:
    </p>
    <Code>{`<Chart data={usage} x="month" y={['documents', 'exports']}
       labels={{ documents: 'Documents', exports: 'Exports' }}
       caption="Documents and exports per month" />`}</Code>
    <Chart
      id="f-chart"
      data={usage}
      x="month"
      y={['documents', 'exports']}
      labels={{ documents: 'Documents', exports: 'Exports' }}
      height={210}
      caption="Documents and exports per month, drawn by Chart"
    />
    <p style={p}>
      <code>type</code> is <code>bar</code>, <code>line</code> or <code>pie</code>;{' '}
      <code>stacked</code> stacks bars; <code>values</code> prints each value; <code>format</code>{' '}
      formats ticks and values; <code>width</code>, <code>height</code> and <code>colors</code>{' '}
      adjust the drawing. Charts use the accent and tints of it, so they follow the design.
    </p>

    <h1 style={h1}>13. Diagrams</h1>
    <p style={p}>
      Write diagrams as text in a <code>.mmd</code> file — a practical subset of Mermaid's flowchart
      syntax — and import it. It is compiled at build time into a drawing in the document's own
      colours; <Ref to="f-workflow" /> is this guide's.
    </p>
    <Code>{`flowchart LR
  Ask[Ask an agent] --> Write[index.tsx]
  Write --> View{Viewer}
  View -->|edit on the page| Write
  View ==> Export([PDF · Word · HTML])`}</Code>
    <ul style={list}>
      <li>
        Directions <code>TD</code> and <code>LR</code>. Nodes <code>A[box]</code>,{' '}
        <code>A(round)</code>, <code>A([stadium])</code>, <code>A[(database)]</code>,{' '}
        <code>A{'{decision}'}</code>, <code>A((circle))</code>.
      </li>
      <li>
        Links <code>--&gt;</code>, <code>---</code>, <code>-.-&gt;</code>, <code>==&gt;</code>, with{' '}
        <code>|labels|</code>. A link back to an earlier step is routed round the side.
      </li>
      <li>
        <code>&lt;Diagram chart={'{…}'} caption width /&gt;</code> places it; a mistake fails the
        build with the line to fix.
      </li>
    </ul>

    <h1 style={h1}>14. Images and assets</h1>
    <p style={p}>
      Import images like code. Shared images live in the workspace's <code>assets/</code> folder and
      are imported through the <code>@assets</code> alias; images used by one document live in its
      own <code>assets/</code> folder and are imported relatively.
    </p>
    <Code>{`import logo from '@assets/logo.svg';
import photo from './assets/team.jpg';

<img src={logo} alt="Company" style={{ width: 120 }} />
<ImagePlaceholder hint="Architecture diagram goes here" height={180} />`}</Code>
    <p style={p}>
      <code>&lt;ImagePlaceholder&gt;</code> reserves the space for a picture you don't have yet, so
      the pagination is already right when it arrives. The Assets panel uploads, renames and deletes
      files and copies the import line for you.
    </p>

    <h1 style={h1}>15. Themes</h1>
    <p style={p}>
      A theme is a reusable house style written as documentation: a Markdown file in{' '}
      <code>themes/</code> describing the design object and the components to copy (title block,
      footer, table), with an optional demo page. Nothing is enforced at runtime — a document copies
      what it needs and sets <code>meta.theme</code> to link back. Ask your agent to{' '}
      <em>create a theme</em> from an existing document to extract one.
    </p>

    <Part>Part three · Output and automation</Part>
    <h1 style={h1}>16. Exporting</h1>
    <p style={p}>
      The <strong>Download</strong> menu first asks which pages — <em>All</em>, <em>This page</em>,
      or a <em>Range</em> such as <code>1-3, 6</code>, read back as you type — then the format (
      <Ref to="t-formats" />
      ).
    </p>
    <Figure id="t-formats" kind="table" caption="Export formats">
      <Table
        columns={['Format', 'Best for']}
        rows={[
          [
            'PDF',
            'Print and final delivery. True page size; from the CLI it also carries bookmarks for every heading and is tagged for screen readers.',
          ],
          [
            'Word (DOCX)',
            'Review in Word: real headings, a table of contents, footnotes, tables, and header/footer with page fields, so track changes and comments work. Word repaginates; drawings arrive as pictures.',
          ],
          ['HTML', 'One self-contained, printable file to send or host.'],
          ['PNG', 'One picture per page at 2×, for slides and chat.'],
          ['SVG', 'One vector page per file, with text kept as text.'],
        ]}
      />
    </Figure>

    <h1 style={h1}>17. The command line</h1>
    <p style={p}>
      Every <code>open-doc</code> command runs in the workspace folder (
      <Ref to="t-cli" />
      ). Headless commands drive the real viewer in a browser, so their output matches the Download
      menu exactly; they need Playwright (
      <code>pnpm add -D playwright &amp;&amp; pnpm exec playwright install chromium</code>).
    </p>
    <Figure id="t-cli" kind="table" caption="Commands and their main options">
      <Table
        columns={['Command', 'What it does']}
        rows={[
          [
            <code key="c">dev [--open] [--mcp]</code>,
            'Start the viewer with hot reload; --mcp serves the MCP endpoint at /mcp.',
          ],
          [
            <code key="c">export &lt;ids…&gt; -f pdf|html|png|docx</code>,
            'Write documents to out/ (-o to change, --all for every document).',
          ],
          [
            <code key="c">check [ids…] [--json]</code>,
            'Report layout faults; exits non-zero on errors, so it works in CI.',
          ],
          [
            <code key="c">diff &lt;id&gt; [--since rev]</code>,
            'What changed since a git revision (default HEAD), page by page.',
          ],
          [
            <code key="c">import &lt;file.md&gt;</code>,
            'Turn Markdown into a document (--id, --title, --contents, --no-cover).',
          ],
          [<code key="c">build [--out-dir]</code>, 'A static site of every document, in dist/.'],
          [<code key="c">preview</code>, 'Serve the static build locally.'],
          [
            <code key="c">sync:skills [--dry-run]</code>,
            "Update the agent skills to this version's.",
          ],
        ]}
      />
    </Figure>

    <h1 style={h1}>18. Checking and reviewing changes</h1>
    <p style={p}>
      <code>open-doc check</code> renders every sheet at true size and reports what you cannot see
      in the source: content running off the page (<code>page-overflow</code>, <code>off-page</code>
      ), a block taller than a page (<code>oversized-block</code>), an empty sheet (
      <code>blank-page</code>), a heading stranded at the foot of a page (
      <code>orphan-heading</code>), type too small to print (<code>tiny-text</code>), an image that
      failed to load (<code>broken-image</code>), and a <code>Ref</code> to nothing (
      <code>unresolved-ref</code>). Each finding points at a source line.
    </p>
    <p style={p}>
      <code>open-doc diff &lt;id&gt; --since main</code> renders the document as it is and as it
      was, pairs the pages by content, and lists each page as changed, added, removed or the same
      with the lines of text that moved. It also writes <code>out/&lt;id&gt;-diff.html</code>: a
      self-contained before-and-after report, changed regions outlined, that you can send to a
      reviewer who has neither the repository nor open-doc.
    </p>

    <h1 style={h1}>19. Importing Markdown</h1>
    <p style={p}>
      <code>open-doc import notes.md --contents</code> turns a Markdown file into an ordinary
      document — a cover, an optional contents page, and a flow section of real headings,
      paragraphs, lists, tables and code. The result is plain TSX, so everything in this guide works
      on it: edit it on the page, restyle it with the design panel, export it.
    </p>

    <h1 style={h1}>20. Publishing a static site</h1>
    <p style={p}>
      <code>open-doc build</code> writes every document into <code>dist/</code> as a static site you
      can host anywhere; <code>open-doc preview</code> serves it locally. Editing, the design panel
      and comments are dev-only and are left out. Use <code>build.showDocBrowser</code> to publish
      just the viewer, <code>base</code> to host under a sub-path, and <code>home</code> to point
      the back arrow at your own site.
    </p>

    <h1 style={h1}>21. Working with a coding agent</h1>
    <p style={p}>
      The workspace ships skills in <code>.agents/skills/</code> that teach agents how open-doc
      documents work (<Ref to="t-skills" />
      ). They are plain Markdown — worth reading yourself.
    </p>
    <Figure id="t-skills" kind="table" caption="Built-in agent skills">
      <Table
        columns={['Skill', 'Used when you ask to…']}
        rows={[
          [<code key="s">create-doc</code>, 'create a new report, proposal or spec'],
          [<code key="s">doc-authoring</code>, 'edit any document — the technical reference'],
          [<code key="s">apply-comments</code>, 'apply the comments you left on the page'],
          [
            <code key="s">current-doc</code>,
            'act on "this page" or "this element" you are viewing',
          ],
          [<code key="s">create-theme</code>, 'create or extract a house style'],
        ]}
      />
    </Figure>
    <Code>{`"Create a 6-page quarterly report from data/costs.csv, with a cover,
 a contents page, two charts and a recommendations section."
"On this page, turn the second paragraph into a table."
"Apply my comments, then run check and show me the diff."`}</Code>
    <p style={p}>
      Agents that speak MCP can drive the workspace directly: start <code>open-doc dev --mcp</code>{' '}
      (with <code>@open-document/mcp</code> installed) and connect to <code>/mcp</code>. Tools cover
      documents (list, read, create, write, rename, duplicate, delete), text and comments, themes,
      assets, folders, and output (<code>check_layout</code>, <code>render_page</code>,{' '}
      <code>export_document</code>, <code>diff_document</code>, <code>import_markdown</code>).
    </p>

    <h1 style={h1}>22. Keyboard shortcuts</h1>
    <Figure id="t-shortcuts" kind="table" caption="Shortcuts in the viewer">
      <Table
        columns={['Keys', 'Where', 'Action']}
        rows={[
          [<Kbd key="k">⌘K</Kbd>, 'Everywhere', 'Search documents, sections, pages and actions'],
          [<Kbd key="k">F</Kbd>, 'Viewer', 'Fullscreen on / off'],
          [<Kbd key="k">D</Kbd>, 'Viewer (dev)', 'Design panel'],
          [<Kbd key="k">Enter</Kbd>, 'Page or zoom field', 'Apply the number you typed'],
          [<Kbd key="k">Esc</Kbd>, 'Fields, menus, search', 'Cancel or close'],
          [<Kbd key="k">⌘B / ⌘I / ⌘E</Kbd>, 'Editing text', 'Bold / italic / code'],
          [<Kbd key="k">⌘K / ⌘\</Kbd>, 'Editing text', 'Link / clear formatting'],
          [<Kbd key="k">Shift+Enter</Kbd>, 'Editing text', 'Line break'],
          [<Kbd key="k">⌘S</Kbd>, 'Edit mode', 'Save pending edits'],
          [<Kbd key="k">⌘Z / ⇧⌘Z</Kbd>, 'Edit mode, design panel', 'Undo / redo'],
        ]}
      />
    </Figure>

    <h1 style={h1}>23. Troubleshooting</h1>
    <ul style={list}>
      <li>
        <strong>Something spills off a page.</strong> Run <code>open-doc check</code>; it names the
        element and the source line. On a fixed page, move content to the next page or into a{' '}
        <code>flow()</code>.
      </li>
      <li>
        <strong>A big gap before a table.</strong> Blocks never split; a tall table moves whole to
        the next page. Split it into two blocks.
      </li>
      <li>
        <strong>Export says Playwright is missing.</strong> Install it as in section 17; the
        Download menu doesn't need it.
      </li>
      <li>
        <strong>An edit won't save.</strong> Text built from a variable or a data file isn't
        editable on the page; the element panel says where it comes from.
      </li>
      <li>
        <strong>Fonts look different in Word.</strong> Word uses fonts installed on the reader's
        machine; set CJK and fallback families in <code>design.fonts</code>.
      </li>
    </ul>
    <Tip>
      A ten-minute tour: type 4 in the page field and 150 in the zoom field · switch to grid and
      back · search for "footnote" · switch to Edit, change a heading, save with ⌘S · press D and
      change the accent · leave a comment for the agent · download this guide as Word · run{' '}
      <code>open-doc diff getting-started</code>.
    </Tip>
  </>,
  { header: Header, footer: Footer },
);

export default [Cover, Contents, Lists, Body] satisfies DocEntry[];
