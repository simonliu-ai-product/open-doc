import {
  DataTable,
  type DesignSystem,
  type DocEntry,
  type DocMeta,
  type DocPage,
  Footnote,
  flow,
  TableOfContents,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
import type { CSSProperties, ReactNode } from 'react';
import metrics from './data/metrics.csv';

export const meta: DocMeta = {
  title: 'Annual report',
  subtitle: 'Performance, findings and what we recommend next',
  author: 'Your team',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#14171c',
    muted: '#667085',
    accent: '#0f5b9e',
    rule: '#e3e7ee',
  },
  fonts: {
    heading: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    body: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  typeScale: { title: 42, h1: 24, h2: 16, h3: 13.5, body: 12.5, caption: 9.5 },
  margin: 72,
  leading: 1.6,
  radius: 4,
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
  margin: '8px 0 12px',
};
const h2: CSSProperties = { fontSize: 'var(--od-size-h2)', fontWeight: 600, margin: '18px 0 8px' };
const p: CSSProperties = { margin: '0 0 10px' };
const list: CSSProperties = { margin: '0 0 10px', paddingLeft: 18 };

const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p
    style={{
      margin: 0,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: 'var(--od-accent)',
    }}
  >
    {children}
  </p>
);

/** One figure that matters, set large, with what it means underneath. */
const Stat = ({ value, label }: { value: string; label: string }) => (
  <div style={{ borderTop: '2px solid var(--od-accent)', paddingTop: 8 }}>
    <div style={{ fontSize: 22, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: 'var(--od-size-caption)', color: 'var(--od-muted)' }}>{label}</div>
  </div>
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
    Annual report
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
    <span>Your organisation · Confidential</span>
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {useDocPageNumber()} / {useDocPageCount()}
    </span>
  </div>
);

const Cover: DocPage = () => (
  <div style={{ ...page, display: 'flex', flexDirection: 'column' }}>
    <div style={{ height: 6, width: 56, background: 'var(--od-accent)', marginBottom: 'auto' }} />
    <Eyebrow>Report · 2026</Eyebrow>
    <h1
      data-od-outline="skip"
      style={{ ...h1, fontSize: 'var(--od-size-title)', lineHeight: 1.1, margin: '14px 0 14px' }}
    >
      Annual report
    </h1>
    <p style={{ ...p, fontSize: 15, color: 'var(--od-muted)', maxWidth: 440 }}>
      Performance, findings and what we recommend next.
    </p>
    <div
      style={{
        marginTop: 48,
        paddingTop: 12,
        borderTop: '1px solid var(--od-rule)',
        display: 'flex',
        gap: 40,
        fontSize: 11,
        color: 'var(--od-muted)',
      }}
    >
      <span>Prepared by Your team</span>
      <span>January 2026</span>
    </div>
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

const Body = flow(
  <>
    <Eyebrow>Summary</Eyebrow>
    <h1 style={h1}>Executive summary</h1>
    <p style={p}>
      State the conclusion first, in two or three sentences: what happened this year, why it
      matters, and the one decision you need from the reader.
    </p>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 20,
        margin: '16px 0 20px',
      }}
    >
      <Stat value="$5.8M" label="Revenue, up 37% on last year" />
      <Stat value="531" label="Customers at year end" />
      <Stat value="2.4%" label="Quarterly churn, down from 3.1%" />
    </div>

    <Eyebrow>Section 1</Eyebrow>
    <h1 style={h1}>Background</h1>
    <p style={p}>
      Describe where things stood at the start of the period and what you set out to do. Keep it to
      what the reader needs to follow the findings.
      <Footnote>Source and method notes go in footnotes, not in the body.</Footnote>
    </p>

    <Eyebrow>Section 2</Eyebrow>
    <h1 style={h1}>Findings</h1>
    <h2 style={h2}>2.1 Growth by quarter</h2>
    <p style={p}>
      The table is printed from <code>data/metrics.csv</code>; replace the file and the numbers
      follow.
    </p>
    <DataTable
      caption="Revenue, customers and churn by quarter"
      rows={metrics}
      columns={[
        { key: 'quarter', label: 'Quarter' },
        { key: 'revenue', label: 'Revenue (USD)', format: 'integer' },
        { key: 'customers', label: 'Customers', format: 'integer' },
        { key: 'churn', label: 'Churn', format: 'percent' },
      ]}
    />
    <h2 style={h2}>2.2 What drove it</h2>
    <p style={p}>Explain the two or three causes behind the numbers, each with its evidence.</p>

    <Eyebrow>Section 3</Eyebrow>
    <h1 style={h1}>Recommendations</h1>
    <ol style={list}>
      <li>The first thing to do, who owns it, and by when.</li>
      <li>The second, with the result you expect from it.</li>
      <li>What to stop doing, and what that frees up.</li>
    </ol>

    <Eyebrow>Appendix</Eyebrow>
    <h1 style={h1}>Appendix</h1>
    <p style={p}>Definitions, detailed tables and anything a careful reader may want to check.</p>
  </>,
  { header: Header, footer: Footer },
);

export default [Cover, Contents, Body] satisfies DocEntry[];
