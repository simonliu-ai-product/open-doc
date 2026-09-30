import type { DesignSystem, DocMeta, DocPage } from '@open-document/core';
import type { CSSProperties } from 'react';

export const meta: DocMeta = {
  title: 'Edit Target',
  createdAt: '2026-01-02T00:00:00.000Z',
};

export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#16181d',
    muted: '#6b7280',
    accent: '#2563eb',
    rule: '#e5e7eb',
  },
  fonts: {
    heading: 'system-ui, sans-serif',
    body: 'system-ui, sans-serif',
    mono: 'ui-monospace, Menlo, monospace',
  },
  typeScale: { title: 44, h1: 28, h2: 20, h3: 16, body: 14, caption: 10 },
  margin: 76,
  leading: 1.55,
  radius: 6,
};

const sheet: CSSProperties = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  padding: 'var(--od-margin)',
  background: 'var(--od-bg)',
  color: 'var(--od-text)',
  fontFamily: 'var(--od-font-body)',
  fontSize: 'var(--od-size-body)',
};

const Only: DocPage = () => (
  <div style={sheet}>
    <h1 style={{ fontSize: 'var(--od-size-h1)', margin: 0 }}>Editable heading</h1>
    <p>Editable paragraph</p>
    <p>Second paragraph stays put</p>
    <p>
      Run before <code>open-doc dev</code> run after
    </p>
  </div>
);

export default [Only] satisfies DocPage[];
