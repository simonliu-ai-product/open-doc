import {
  DataTable,
  type DocEntry,
  type DocMeta,
  type DocPage,
  Figure,
  Footnote,
  Footnotes,
  flow,
  ListOfFigures,
  ListOfTables,
  Ref,
} from '@open-document/core';
import type { CSSProperties } from 'react';
import rows from './data/rows.csv';

export const meta: DocMeta = {
  title: 'Long Form',
  subtitle: 'Fixture for footnotes, numbering, and data',
  createdAt: '2026-01-06T00:00:00.000Z',
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
    <h1 style={{ fontSize: 32, margin: 0 }} data-od-outline="skip">
      Long Form
    </h1>
    <p>
      A cover note
      <Footnote id="cover-note">Collected from the page, not from the flow.</Footnote>
    </p>
    <h2 style={{ fontSize: 18 }} data-od-outline="skip">
      Lists
    </h2>
    <ListOfTables />
    <ListOfFigures />
    <Footnotes />
  </div>
);

const Body = flow(
  <>
    <h1 style={{ fontSize: 24, margin: '0 0 12px' }}>Findings</h1>
    <p style={{ margin: '0 0 12px' }}>
      A claim that needs a source
      <Footnote id="source-note">Measured from the fixture data.</Footnote> and then some more text.
    </p>

    <DataTable
      id="rows-table"
      caption="Fixture rows"
      rows={rows}
      columns={['service', 'requests', 'cost']}
    />

    <p style={{ margin: '0 0 12px' }}>
      The table is <Ref to="rows-table" /> and the drawing is <Ref to="drawing" />.
    </p>

    <Figure id="drawing" caption="A drawn box">
      <div style={{ height: 120, border: '1px solid #ccc' }} />
    </Figure>

    <p style={{ margin: '0 0 12px' }}>
      Referring back to <Ref to="rows-table" /> from further down.
    </p>
  </>,
);

export default [Cover, Body] satisfies DocEntry[];
