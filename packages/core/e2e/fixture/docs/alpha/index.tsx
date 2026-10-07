import type { DocMeta, DocPage } from '@open-document/core';
import type { CSSProperties } from 'react';

export const meta: DocMeta = {
  lang: 'en-GB',
  title: 'Alpha Report',
  subtitle: 'Fixture document one',
  theme: 'plain',
  createdAt: '2026-01-03T00:00:00.000Z',
};

const sheet: CSSProperties = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  padding: 76,
  background: '#ffffff',
  color: '#16181d',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14,
};

const Cover: DocPage = () => (
  <div style={sheet}>
    <h1 style={{ fontSize: 44, margin: 0 }}>Alpha page one</h1>
    <p>Opening content</p>
  </div>
);

const Middle: DocPage = () => (
  <div style={sheet}>
    <h1 style={{ fontSize: 28, margin: 0 }}>Alpha page two</h1>
    <p>Middle content</p>
  </div>
);

const Closing: DocPage = () => (
  <div style={sheet}>
    <h1 style={{ fontSize: 28, margin: 0 }}>Alpha page three</h1>
    <p>Closing content</p>
  </div>
);

export default [Cover, Middle, Closing] satisfies DocPage[];
