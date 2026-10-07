import {
  type DesignSystem,
  type DocEntry,
  type DocMeta,
  type DocPage,
  flow,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
import type { CSSProperties, ReactNode } from 'react';

export const meta: DocMeta = {
  title: 'Project proposal',
  subtitle: 'What we propose, what it costs, and when it lands',
  author: 'Your team',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#17161a',
    muted: '#6b6873',
    accent: '#6d28d9',
    rule: '#e7e5ec',
  },
  fonts: {
    heading: 'Georgia, "Times New Roman", serif',
    body: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  typeScale: { title: 44, h1: 24, h2: 16, h3: 13.5, body: 12.5, caption: 9.5 },
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
  fontFamily: 'var(--od-font-heading)',
  fontSize: 'var(--od-size-h1)',
  fontWeight: 600,
  margin: '10px 0 12px',
};
const h2: CSSProperties = { fontSize: 'var(--od-size-h2)', fontWeight: 600, margin: '16px 0 8px' };
const p: CSSProperties = { margin: '0 0 10px' };
const list: CSSProperties = { margin: '0 0 10px', paddingLeft: 18 };
const cell: CSSProperties = {
  borderBottom: '1px solid var(--od-rule)',
  padding: '6px 8px',
  textAlign: 'left',
  verticalAlign: 'top',
  fontSize: 11.5,
};
const head: CSSProperties = { ...cell, fontWeight: 600, color: 'var(--od-muted)', fontSize: 10.5 };

const Table = ({
  columns,
  rows,
  align = [],
}: {
  columns: string[];
  rows: ReactNode[][];
  align?: Array<'left' | 'right'>;
}) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', margin: '6px 0 14px' }}>
    <thead>
      <tr>
        {columns.map((column, at) => (
          <th key={column} style={{ ...head, textAlign: align[at] ?? 'left' }}>
            {column}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
        <tr key={r}>
          {row.map((value, c) => (
            <td
              // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
              key={c}
              style={{
                ...cell,
                textAlign: align[c] ?? 'left',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {value}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

const SectionNo = ({ n }: { n: string }) => (
  <span style={{ color: 'var(--od-accent)', marginRight: 10 }}>{n}</span>
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
    }}
  >
    <span>Project proposal · Prepared for Client name</span>
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {useDocPageNumber()} / {useDocPageCount()}
    </span>
  </div>
);

const Cover: DocPage = () => (
  <div
    style={{
      ...page,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      borderLeft: '10px solid var(--od-accent)',
    }}
  >
    <p style={{ ...p, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
      Proposal for Client name
    </p>
    <h1
      data-od-outline="skip"
      style={{ ...h1, fontSize: 'var(--od-size-title)', lineHeight: 1.1, margin: '6px 0 18px' }}
    >
      Project proposal
    </h1>
    <p style={{ ...p, fontSize: 15, color: 'var(--od-muted)', maxWidth: 420 }}>
      What we propose, what it costs, and when it lands.
    </p>
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '4px 18px',
        marginTop: 56,
        fontSize: 11.5,
      }}
    >
      <dt style={{ color: 'var(--od-muted)' }}>Prepared by</dt>
      <dd style={{ margin: 0 }}>Your name, Your company</dd>
      <dt style={{ color: 'var(--od-muted)' }}>Date</dt>
      <dd style={{ margin: 0 }}>January 2026</dd>
      <dt style={{ color: 'var(--od-muted)' }}>Valid until</dt>
      <dd style={{ margin: 0 }}>31 March 2026</dd>
    </dl>
  </div>
);

const Body = flow(
  <>
    <h1 style={h1}>
      <SectionNo n="01" />
      The problem
    </h1>
    <p style={p}>
      Describe the situation in the client's own terms: what is not working, what it costs them, and
      why it matters now.
    </p>

    <h1 style={h1}>
      <SectionNo n="02" />
      Our approach
    </h1>
    <p style={p}>Explain the solution in a paragraph, then the parts it is made of.</p>
    <ul style={list}>
      <li>The first part, and the result it produces.</li>
      <li>The second part, and how it builds on the first.</li>
      <li>How you will know it worked.</li>
    </ul>

    <h1 style={h1}>
      <SectionNo n="03" />
      Scope
    </h1>
    <h2 style={h2}>Included</h2>
    <ul style={list}>
      <li>Deliverable one</li>
      <li>Deliverable two</li>
    </ul>
    <h2 style={h2}>Not included</h2>
    <ul style={list}>
      <li>What the client should not expect, said plainly.</li>
    </ul>

    <h1 style={h1}>
      <SectionNo n="04" />
      Timeline
    </h1>
    <Table
      columns={['Phase', 'What happens', 'Weeks']}
      align={['left', 'left', 'right']}
      rows={[
        ['Discovery', 'Interviews, audit, agreed plan', '2'],
        ['Build', 'The work itself, reviewed every week', '6'],
        ['Handover', 'Training, documentation, sign-off', '1'],
      ]}
    />

    <h1 style={h1}>
      <SectionNo n="05" />
      Investment
    </h1>
    <Table
      columns={['Item', 'Amount (USD)']}
      align={['left', 'right']}
      rows={[
        ['Discovery', '8,000'],
        ['Build', '36,000'],
        ['Handover', '4,000'],
        [<strong key="t">Total</strong>, <strong key="v">48,000</strong>],
      ]}
    />
    <p style={{ ...p, fontSize: 'var(--od-size-caption)', color: 'var(--od-muted)' }}>
      Invoiced at the start of each phase. Prices exclude tax.
    </p>

    <h1 style={h1}>
      <SectionNo n="06" />
      Next steps
    </h1>
    <p style={p}>Sign below to accept, and we will schedule the first workshop within a week.</p>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 40,
        marginTop: 36,
        fontSize: 11,
        color: 'var(--od-muted)',
      }}
    >
      <div style={{ borderTop: '1px solid var(--od-text)', paddingTop: 6 }}>
        For Client name — signature and date
      </div>
      <div style={{ borderTop: '1px solid var(--od-text)', paddingTop: 6 }}>
        For Your company — signature and date
      </div>
    </div>
  </>,
  { footer: Footer },
);

export default [Cover, Body] satisfies DocEntry[];
