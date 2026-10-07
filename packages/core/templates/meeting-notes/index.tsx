import {
  type DesignSystem,
  type DocEntry,
  type DocMeta,
  flow,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
import type { CSSProperties, ReactNode } from 'react';

export const meta: DocMeta = {
  title: 'Weekly sync',
  subtitle: 'Meeting notes',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#15181b',
    muted: '#65707b',
    accent: '#0f766e',
    rule: '#e2e8ec',
  },
  fonts: {
    heading: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    body: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  typeScale: { title: 30, h1: 18, h2: 14, h3: 12.5, body: 12, caption: 9.5 },
  margin: 64,
  leading: 1.55,
  radius: 4,
};

const h1: CSSProperties = {
  fontSize: 'var(--od-size-h1)',
  fontWeight: 650,
  margin: '20px 0 8px',
  paddingBottom: 4,
  borderBottom: '1px solid var(--od-rule)',
};
const h2: CSSProperties = { fontSize: 'var(--od-size-h2)', fontWeight: 600, margin: '12px 0 6px' };
const p: CSSProperties = { margin: '0 0 8px' };
const list: CSSProperties = { margin: '0 0 8px', paddingLeft: 18 };
const cell: CSSProperties = {
  borderBottom: '1px solid var(--od-rule)',
  padding: '6px 8px',
  textAlign: 'left',
  verticalAlign: 'top',
  fontSize: 11.5,
};
const head: CSSProperties = { ...cell, fontWeight: 600, color: 'var(--od-muted)', fontSize: 10.5 };

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <dt style={{ color: 'var(--od-muted)' }}>{label}</dt>
    <dd style={{ margin: 0 }}>{children}</dd>
  </>
);

const Status = ({ children }: { children: string }) => (
  <span
    style={{
      fontSize: 10,
      padding: '1px 6px',
      borderRadius: 'var(--od-radius)',
      border: '1px solid var(--od-rule)',
      color: 'var(--od-muted)',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
);

const Footer = () => (
  <div
    style={{
      position: 'absolute',
      left: 'var(--od-margin)',
      right: 'var(--od-margin)',
      bottom: 32,
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 'var(--od-size-caption)',
      color: 'var(--od-muted)',
    }}
  >
    <span>Weekly sync · 12 January 2026</span>
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {useDocPageNumber()} / {useDocPageCount()}
    </span>
  </div>
);

const Body = flow(
  <>
    <p
      style={{
        ...p,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--od-accent)',
      }}
    >
      Meeting notes
    </p>
    <h1
      data-od-outline="skip"
      style={{
        fontSize: 'var(--od-size-title)',
        fontWeight: 650,
        letterSpacing: '-0.01em',
        margin: '0 0 14px',
      }}
    >
      Weekly sync
    </h1>
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr',
        gap: '4px 12px',
        margin: '0 0 6px',
        fontSize: 11.5,
      }}
    >
      <Fact label="Date">Monday 12 January 2026, 10:00–10:45</Fact>
      <Fact label="Attendees">Alex Chen, Sam Lee, Jordan Wu</Fact>
      <Fact label="Absent">Taylor Lin</Fact>
      <Fact label="Notes by">Sam Lee</Fact>
    </dl>

    <h1 style={h1}>Agenda</h1>
    <ol style={list}>
      <li>Last week's actions</li>
      <li>Launch readiness</li>
      <li>Anything else</li>
    </ol>

    <h1 style={h1}>Discussion</h1>
    <h2 style={h2}>1. Last week's actions</h2>
    <p style={p}>What was done, and what slipped and why.</p>
    <h2 style={h2}>2. Launch readiness</h2>
    <p style={p}>The points raised, who raised them, and where the group landed.</p>

    <h1 style={h1}>Decisions</h1>
    <ul style={list}>
      <li>
        <strong>Launch stays on 2 February.</strong> The remaining risk is covered by the rollback
        plan.
      </li>
    </ul>

    <h1 style={h1}>Action items</h1>
    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '4px 0 10px' }}>
      <thead>
        <tr>
          <th style={head}>Action</th>
          <th style={head}>Owner</th>
          <th style={head}>Due</th>
          <th style={head}>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={cell}>Write the rollback plan</td>
          <td style={cell}>Alex</td>
          <td style={cell}>16 Jan</td>
          <td style={cell}>
            <Status>Open</Status>
          </td>
        </tr>
        <tr>
          <td style={cell}>Confirm the launch email copy</td>
          <td style={cell}>Jordan</td>
          <td style={cell}>19 Jan</td>
          <td style={cell}>
            <Status>Open</Status>
          </td>
        </tr>
      </tbody>
    </table>
    <p style={{ ...p, fontSize: 'var(--od-size-caption)', color: 'var(--od-muted)' }}>
      Next meeting: Monday 19 January 2026, 10:00.
    </p>
  </>,
  { footer: Footer },
);

export default [Body] satisfies DocEntry[];
