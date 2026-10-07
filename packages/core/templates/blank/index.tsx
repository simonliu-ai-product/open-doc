import {
  type DesignSystem,
  type DocEntry,
  type DocMeta,
  flow,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
import type { CSSProperties } from 'react';

export const meta: DocMeta = {
  title: 'Untitled document',
  createdAt: '2026-01-01T00:00:00.000Z',
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
  typeScale: { title: 40, h1: 24, h2: 17, h3: 14, body: 12.5, caption: 10 },
  margin: 72,
  leading: 1.6,
  radius: 6,
};

const h1: CSSProperties = { fontSize: 'var(--od-size-h1)', fontWeight: 650, margin: '0 0 12px' };
const p: CSSProperties = { margin: '0 0 10px' };

const Footer = () => (
  <div
    style={{
      position: 'absolute',
      left: 'var(--od-margin)',
      right: 'var(--od-margin)',
      bottom: 36,
      textAlign: 'right',
      fontSize: 'var(--od-size-caption)',
      color: 'var(--od-muted)',
      fontVariantNumeric: 'tabular-nums',
    }}
  >
    {useDocPageNumber()} / {useDocPageCount()}
  </div>
);

const Body = flow(
  <>
    <h1 style={h1}>Untitled document</h1>
    <p style={p}>Start writing here.</p>
  </>,
  { footer: Footer },
);

export default [Body] satisfies DocEntry[];
