import {
  type DesignSystem,
  type DocMeta,
  type DocPage,
  TableOfContents,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
import type { CSSProperties, ReactNode } from 'react';

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
  typeScale: { title: 44, h1: 28, h2: 20, h3: 16, body: 14, caption: 10 },
  margin: 76,
  leading: 1.55,
  radius: 6,
};

const page: CSSProperties = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  padding: 'var(--od-margin)',
  background: 'var(--od-bg)',
  color: 'var(--od-text)',
  fontFamily: 'var(--od-font-body)',
  fontSize: 'var(--od-size-body)',
  lineHeight: 'var(--od-leading)',
  position: 'relative',
};

const h1: CSSProperties = {
  fontFamily: 'var(--od-font-heading)',
  fontSize: 'var(--od-size-h1)',
  lineHeight: 1.2,
  fontWeight: 650,
  letterSpacing: '-0.015em',
  margin: '0 0 18px',
};

const h2: CSSProperties = {
  fontFamily: 'var(--od-font-heading)',
  fontSize: 'var(--od-size-h2)',
  lineHeight: 1.25,
  fontWeight: 600,
  margin: '24px 0 10px',
};

const p: CSSProperties = { margin: '0 0 14px' };

const Code = ({ children }: { children: ReactNode }) => (
  <pre
    style={{
      fontFamily: 'var(--od-font-mono)',
      fontSize: 11.5,
      lineHeight: 1.55,
      background: '#f6f7f9',
      border: '1px solid var(--od-rule)',
      borderRadius: 'var(--od-radius)',
      padding: '12px 14px',
      margin: '0 0 14px',
      whiteSpace: 'pre-wrap',
    }}
  >
    {children}
  </pre>
);

const Footer = () => {
  const n = useDocPageNumber();
  const total = useDocPageCount();
  return (
    <div
      style={{
        position: 'absolute',
        left: 'var(--od-margin)',
        right: 'var(--od-margin)',
        bottom: 40,
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
        {n} / {total}
      </span>
    </div>
  );
};

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
      open-doc
    </p>
    <h1
      data-od-outline="skip"
      style={{ ...h1, fontSize: 'var(--od-size-title)', margin: '0 0 16px', maxWidth: 480 }}
    >
      Getting started
    </h1>
    <p style={{ ...p, fontSize: 15, color: 'var(--od-muted)', maxWidth: 460 }}>
      Documents written as React. One component per printed page — the framework handles the sheet,
      the outline, and the export.
    </p>
    <p style={{ ...p, marginTop: 40, fontSize: 11, color: 'var(--od-muted)' }}>
      Delete this document once you've read it — it's just a starting point.
    </p>
  </div>
);

const Contents: DocPage = () => (
  <div style={page}>
    <h1 style={h1} data-od-outline="skip">
      Contents
    </h1>
    <TableOfContents maxLevel={2} />
    <p style={{ ...p, marginTop: 24, fontSize: 12, color: 'var(--od-muted)' }}>
      This list is generated from the headings on the following pages. Page numbers update on their
      own — never write a contents list by hand.
    </p>
    <Footer />
  </div>
);

const HowItWorks: DocPage = () => (
  <div style={page}>
    <h1 style={h1}>How a document works</h1>
    <p style={p}>
      A document is a folder under <code>docs/</code> with a single <code>index.tsx</code>. It
      default-exports an array of components — one per page, in order. There is no automatic reflow:
      what you put on a page is exactly what lands on that sheet.
    </p>

    <Code>{`docs/
  my-report/
    index.tsx     // export default [Cover, Summary, …]
    assets/       // optional images`}</Code>

    <h2 style={h2}>The page canvas</h2>
    <p style={p}>
      A4 portrait is 794 × 1123 CSS pixels at 96dpi. With the default 76px margin, the text block is
      642 × 971 — about 44 lines of body copy. Design in absolute pixels; the viewer only scales the
      whole sheet.
    </p>

    <h2 style={h2}>Design tokens</h2>
    <p style={p}>
      The exported <code>design</code> const becomes CSS variables on every page:
      <code> var(--od-bg)</code>, <code>var(--od-text)</code>, <code>var(--od-accent)</code>,
      <code> var(--od-size-body)</code>, <code>var(--od-margin)</code>, and the rest. Change one
      value and the whole document follows.
    </p>

    <Footer />
  </div>
);

const Authoring: DocPage = () => (
  <div style={page}>
    <h1 style={h1}>Writing with an agent</h1>
    <p style={p}>
      This workspace ships with two skills. Ask your coding agent to draft a document and it runs
      the <code>create-doc</code> workflow: scoping questions, a page plan, then the file.
    </p>

    <h2 style={h2}>Outline, contents, page numbers</h2>
    <p style={p}>
      Use real <code>h1</code>/<code>h2</code>/<code>h3</code> elements for section titles — the
      framework scans them to build the sidebar outline and to fill{' '}
      <code>&lt;TableOfContents /&gt;</code>. Page numbers come from <code>useDocPageNumber()</code>{' '}
      and <code>useDocPageCount()</code>; never hardcode them.
    </p>

    <Code>{`import { useDocPageNumber, useDocPageCount } from '@open-document/core';

const Footer = () => {
  const n = useDocPageNumber();
  const total = useDocPageCount();
  return <span>{n} / {total}</span>;
};`}</Code>

    <h2 style={h2}>Exporting</h2>
    <p style={p}>
      <strong>PDF</strong> prints at the true page size — choose "Save as PDF" in the print dialog.
      <strong> HTML</strong> downloads a self-contained copy (a zip when the document has assets).
      Both wait for fonts and images, and both fill the contents list before serializing.
    </p>

    <h2 style={h2}>Next</h2>
    <p style={p}>
      Delete this folder, then ask your agent for the document you actually need. Everything the
      agent has to know lives in the <code>doc-authoring</code> skill.
    </p>

    <Footer />
  </div>
);

export const meta: DocMeta = {
  title: 'Getting started',
  subtitle: 'A tour of open-doc',
  pageSize: 'A4',
  createdAt: '2026-08-15T13:44:40.268Z',
};

export default [Cover, Contents, HowItWorks, Authoring] satisfies DocPage[];
