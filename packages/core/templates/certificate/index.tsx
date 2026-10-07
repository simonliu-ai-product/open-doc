import {
  type DesignSystem,
  type DocEntry,
  type DocMeta,
  type DocPage,
  Field,
} from '@open-document/core';
import type { CSSProperties } from 'react';
import recipients from './data/recipients.csv';

// One copy of the document per row. The viewer shows a picker to preview each
// row; `open-doc export <id> --each` writes one file per row, named by
// `meta.recordName`.
export const records = recipients;

export const meta: DocMeta = {
  title: 'Certificate of completion',
  orientation: 'landscape',
  createdAt: '2026-01-01T00:00:00.000Z',
  recordName: 'certificate-{name}',
  recordLabel: 'name',
};

export const design: DesignSystem = {
  palette: {
    bg: '#fffdf8',
    text: '#1f1d1a',
    muted: '#7a7369',
    accent: '#a16207',
    rule: '#e8e1d4',
  },
  fonts: {
    heading: 'Georgia, "Times New Roman", serif',
    body: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  typeScale: { title: 46, h1: 30, h2: 18, h3: 14, body: 13, caption: 10 },
  margin: 56,
  leading: 1.5,
  radius: 0,
};

const page: CSSProperties = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  padding: 'var(--od-margin)',
  position: 'relative',
};

const small: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--od-muted)',
  margin: 0,
};

const Certificate: DocPage = () => (
  <div style={page}>
    <div
      style={{
        height: '100%',
        boxSizing: 'border-box',
        border: '1px solid var(--od-accent)',
        outline: '6px double var(--od-rule)',
        outlineOffset: -14,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 80px',
      }}
    >
      <p style={small}>Your organisation</p>
      <h1
        style={{
          fontFamily: 'var(--od-font-heading)',
          fontSize: 'var(--od-size-title)',
          fontWeight: 400,
          margin: '22px 0 26px',
        }}
      >
        Certificate of completion
      </h1>
      <p style={{ margin: 0, color: 'var(--od-muted)' }}>This certifies that</p>
      <p
        style={{
          fontFamily: 'var(--od-font-heading)',
          fontSize: 'var(--od-size-h1)',
          margin: '10px 0 14px',
          padding: '0 24px 8px',
          borderBottom: '1px solid var(--od-accent)',
        }}
      >
        <Field name="name" />
      </p>
      <p style={{ margin: 0, maxWidth: 520 }}>
        has completed{' '}
        <strong>
          <Field name="course" />
        </strong>
        , <Field name="hours" /> hours of study.
      </p>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: 560,
          marginTop: 56,
          fontSize: 11,
          color: 'var(--od-muted)',
        }}
      >
        <span style={{ borderTop: '1px solid var(--od-text)', paddingTop: 6, minWidth: 180 }}>
          <Field name="date" />
        </span>
        <span style={{ borderTop: '1px solid var(--od-text)', paddingTop: 6, minWidth: 180 }}>
          Signature
        </span>
      </div>
    </div>
  </div>
);

export default [Certificate] satisfies DocEntry[];
