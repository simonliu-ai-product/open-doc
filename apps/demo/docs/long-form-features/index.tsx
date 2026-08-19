import {
  DataTable,
  type DesignSystem,
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
  TableOfContents,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
import services from './data/services.csv';

export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#16181d',
    muted: '#6b7280',
    accent: '#2563eb',
    rule: '#e5e7eb',
  },
  fonts: {
    heading: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    body: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
  },
  typeScale: { title: 44, h1: 28, h2: 20, h3: 16, body: 14, caption: 10 },
  margin: 76,
  leading: 1.55,
  radius: 6,
};

const page = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box' as const,
  padding: 'var(--od-margin)',
  background: 'var(--od-bg)',
  color: 'var(--od-text)',
  fontFamily: 'var(--od-font-body)',
  fontSize: 'var(--od-size-body)',
  lineHeight: 'var(--od-leading)',
  position: 'relative' as const,
};

const h1 = {
  fontFamily: 'var(--od-font-heading)',
  fontSize: 'var(--od-size-h1)',
  lineHeight: 1.2,
  fontWeight: 650,
  margin: '0 0 18px',
};

const h2 = { ...h1, fontSize: 'var(--od-size-h2)', margin: '26px 0 12px' };
const p = { margin: '0 0 12px' };

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
      }}
    >
      <span>Platform Reliability Review</span>
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
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--od-accent)',
        margin: 0,
      }}
    >
      Platform Engineering
    </p>
    <h1
      style={{ ...h1, fontSize: 'var(--od-size-title)', margin: '16px 0 12px' }}
      data-od-outline="skip"
    >
      Platform Reliability Review
    </h1>
    <p style={{ color: 'var(--od-muted)', margin: 0 }}>
      Q3 2026
      <Footnote id="cover-scope">
        Covers the five services in the shared platform tier. Edge and batch workloads are reviewed
        separately.
      </Footnote>
    </p>
    <Footnotes />
  </div>
);

const Contents: DocPage = () => (
  <div style={page}>
    <h1 style={h1} data-od-outline="skip">
      Contents
    </h1>
    <TableOfContents maxLevel={2} />
    <h2 style={{ ...h2, marginTop: 32 }} data-od-outline="skip">
      Tables
    </h2>
    <ListOfTables />
    <h2 style={h2} data-od-outline="skip">
      Figures
    </h2>
    <ListOfFigures />
  </div>
);

const Body = flow(
  <>
    <h1 style={h1}>1. Method</h1>
    <p style={p}>
      Every number in this review comes from the request logs of the platform tier, sampled over the
      quarter and reconciled against the billing export.
      <Footnote id="sources">
        Request counts: edge log pipeline, 2026-07-01 to 2026-09-30. Cost: billing export dated
        2026-10-02.
      </Footnote>{' '}
      Nothing here is modelled or extrapolated.
    </p>
    <p style={p}>
      Latency is reported at the 99th percentile because the mean hides exactly the failures users
      complain about. Error rate is the share of 5xx responses, excluding client cancellations.
      <Footnote>
        Cancellations are counted separately; they rose 4% and are not treated as failures.
      </Footnote>
    </p>

    <h1 style={h1}>2. Where the quarter went</h1>
    <p style={p}>
      Five services carry the platform tier. <Ref to="service-table" /> lists them with the volume
      they served and what they cost to run.
    </p>

    <DataTable
      id="service-table"
      caption="Platform tier, Q3 2026"
      rows={services}
      columns={[
        { key: 'service', label: 'Service' },
        { key: 'requests', label: 'Requests', format: 'integer' },
        { key: 'p99_ms', label: 'p99 (ms)', format: 'integer' },
        { key: 'error_rate', label: 'Errors', format: 'percent' },
        { key: 'monthly_cost', label: 'Cost / mo', format: 'integer' },
      ]}
    />

    <p style={p}>
      Two things stand out. <code>media-api</code> serves the least traffic and costs the second
      most, and its p99 is an order of magnitude worse than everything else.
      <Footnote>
        Its transcoding path runs synchronously inside the request. Moving it behind a queue is the
        single largest latency win available this quarter.
      </Footnote>{' '}
      <code>auth-api</code> is the opposite: the highest volume, the lowest latency, the lowest
      cost.
    </p>

    <Figure
      id="cost-shape"
      caption="Monthly cost against requests served — the further above the line, the worse the value"
    >
      <div
        style={{
          height: 190,
          border: '1px solid var(--od-rule)',
          borderRadius: 'var(--od-radius)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 14,
          padding: 16,
          boxSizing: 'border-box',
        }}
      >
        {services.map((row) => (
          <div key={String(row.service)} style={{ flex: 1, textAlign: 'center' }}>
            <div
              style={{
                height: (Number(row.monthly_cost) / 48120) * 120,
                background: 'var(--od-accent)',
                borderRadius: 2,
              }}
            />
            <div style={{ fontSize: 9, color: 'var(--od-muted)', marginTop: 6 }}>
              {String(row.service).replace('-api', '')}
            </div>
          </div>
        ))}
      </div>
    </Figure>

    <p style={p}>
      The shape in <Ref to="cost-shape" /> is what the table makes hard to see: cost does not track
      volume at all. Three of the five services are priced by the resources their worst path
      reserves, not by what they actually serve.
    </p>

    <h1 style={h1}>3. Recommendations</h1>
    <p style={p}>
      Move transcoding out of the request path. This is the only change that improves latency and
      cost at the same time, and it is contained to one service.
      <Footnote>
        Estimated at two engineer-weeks, including the migration of in-flight jobs.
      </Footnote>
    </p>
    <p style={p}>
      Re-baseline the reserved capacity for the three over-provisioned services once the transcoding
      change lands, rather than before — the current reservations are sized for a peak that will no
      longer exist.
    </p>
    <p style={p}>
      Leave <code>auth-api</code> alone. It is the cheapest and fastest service in the tier, and the
      temptation to fold it into a shared deployment is how that stops being true.
    </p>
  </>,
  { footer: Footer },
);

export const meta: DocMeta = {
  title: 'Platform Reliability Review',
  subtitle: 'Long-form features — footnotes, numbering, cross-references, data',
  pageSize: 'A4',
  createdAt: '2026-08-19T15:00:00.000Z',
};
export default [Cover, Contents, Body] satisfies DocEntry[];
