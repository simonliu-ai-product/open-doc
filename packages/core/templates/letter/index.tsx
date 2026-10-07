import type { DesignSystem, DocEntry, DocMeta, DocPage } from '@open-document/core';
import type { CSSProperties } from 'react';

export const meta: DocMeta = {
  title: 'Letter',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#1a1a1a',
    muted: '#6b6b6b',
    accent: '#9a3412',
    rule: '#e6e2dd',
  },
  fonts: {
    heading: 'Georgia, "Times New Roman", serif',
    body: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  typeScale: { title: 22, h1: 18, h2: 14, h3: 12.5, body: 12.5, caption: 9.5 },
  margin: 80,
  leading: 1.6,
  radius: 0,
};

const page: CSSProperties = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  padding: 'var(--od-margin)',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'var(--od-font-body)',
};
const p: CSSProperties = { margin: '0 0 12px' };
const small: CSSProperties = { fontSize: 11, color: 'var(--od-muted)', lineHeight: 1.5 };

const Letter: DocPage = () => (
  <div style={page}>
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingBottom: 14,
        borderBottom: '2px solid var(--od-accent)',
        marginBottom: 36,
      }}
    >
      <div style={{ fontFamily: 'var(--od-font-heading)', fontSize: 'var(--od-size-title)' }}>
        Your company
      </div>
      <div style={{ ...small, textAlign: 'right' }}>
        123 Example Street, City 10001
        <br />
        hello@example.com · +1 555 0100
      </div>
    </header>

    <address style={{ ...p, fontStyle: 'normal', marginBottom: 24 }}>
      Recipient name
      <br />
      Title, Organisation
      <br />
      456 Another Road
      <br />
      City 20002
    </address>

    <p style={{ ...p, marginBottom: 24 }}>12 January 2026</p>

    <p style={{ ...p, fontWeight: 700 }}>Subject: what this letter is about</p>

    <p style={p}>Dear Recipient name,</p>
    <p style={p}>
      Open with the reason you are writing, in one sentence the reader cannot misread.
    </p>
    <p style={p}>
      Give the detail they need to act: the facts, what you are asking for, and by when. Keep each
      paragraph to one idea.
    </p>
    <p style={p}>Close by saying what happens next, and how to reach you.</p>

    <p style={{ ...p, marginTop: 12 }}>Yours sincerely,</p>
    <div style={{ height: 52 }} />
    <p style={{ ...p, margin: 0 }}>Your name</p>
    <p style={{ ...small, margin: 0 }}>Your title, Your company</p>

    <footer
      style={{
        ...small,
        marginTop: 'auto',
        paddingTop: 10,
        borderTop: '1px solid var(--od-rule)',
        fontSize: 'var(--od-size-caption)',
      }}
    >
      Your company Ltd · Registered in Country, No. 0000000
    </footer>
  </div>
);

export default [Letter] satisfies DocEntry[];
