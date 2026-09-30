import {
  DataTable,
  type DesignSystem,
  type DocEntry,
  type DocMeta,
  type DocPage,
  Figure,
  Footnote,
  flow,
  TableOfContents,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
import type { CSSProperties } from 'react';

export const meta: DocMeta = {
  title: '平台可靠度季報',
  author: '平台工程部',
  createdAt: '2026-01-04T00:00:00.000Z',
};

export const design: DesignSystem = {
  palette: { bg: '#ffffff', text: '#16181d', muted: '#6b7280', accent: '#2563eb', rule: '#e5e7eb' },
  fonts: {
    heading: '"Noto Sans TC", "Helvetica Neue", sans-serif',
    body: '"Noto Sans TC", "Helvetica Neue", sans-serif',
    mono: 'ui-monospace, Menlo, monospace',
  },
  typeScale: { title: 44, h1: 28, h2: 20, h3: 16, body: 14, caption: 10 },
  margin: 76,
  leading: 1.6,
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

const h1: CSSProperties = { fontSize: 'var(--od-size-h1)', fontWeight: 700, margin: '0 0 12px' };
const h2: CSSProperties = { fontSize: 'var(--od-size-h2)', fontWeight: 700, margin: '16px 0 8px' };
const p: CSSProperties = { margin: '0 0 10px', lineHeight: 'var(--od-leading)' };

const rows = [
  { service: '結帳服務', requests: 18402111, cost: 48120 },
  { service: '搜尋服務', requests: 9120004, cost: 21400 },
];

const Cover: DocPage = () => (
  <div style={{ ...sheet, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
    <p style={{ ...p, textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 12 }}>
      Platform engineering
    </p>
    <h1 data-od-outline="skip" style={{ ...h1, fontSize: 'var(--od-size-title)' }}>
      平台可靠度季報
    </h1>
    <p style={p}>第三季・平台工程部</p>
    <h2 data-od-outline="skip" style={h2}>
      目錄
    </h2>
    <TableOfContents />
  </div>
);

const Footer = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 10,
      color: 'var(--od-muted)',
    }}
  >
    <span>平台可靠度季報</span>
    <span>
      {useDocPageNumber()} / {useDocPageCount()}
    </span>
  </div>
);

const Body = flow(
  <>
    <h1 style={h1}>一、方法</h1>
    <p style={p}>
      本報告的數字全部來自平台層的<strong>請求日誌</strong>，並與<em>帳單匯出</em>核對
      <Footnote id="source">日誌管線，2026-07-01 至 2026-09-30。</Footnote>。 設定檔位於{' '}
      <code>ops/reliability.yaml</code>，細節見<a href="https://example.com/method">方法說明</a>。
    </p>
    <h2 style={h2}>觀察重點</h2>
    <ul style={p}>
      <li>延遲以第 99 百分位計算</li>
      <li>錯誤率不含客戶端取消</li>
    </ul>
    <ol style={p}>
      <li>先移出轉檔流程</li>
      <li>再調整保留容量</li>
    </ol>
    <h1 style={h1}>二、本季花費</h1>
    <DataTable
      caption="各服務用量"
      rows={rows}
      columns={[
        { key: 'service', label: '服務' },
        { key: 'requests', label: '請求數', format: 'integer' },
        { key: 'cost', label: '月費', format: 'integer' },
      ]}
    />
    <Figure caption="每月費用與請求量">
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
        <div style={{ width: 40, height: 70, background: 'var(--od-accent)' }} />
        <div style={{ width: 40, height: 30, background: 'var(--od-accent)' }} />
      </div>
    </Figure>
    <pre style={{ fontFamily: 'var(--od-font-mono)', margin: '0 0 10px' }}>
      {`queue:
  transcode: async`}
    </pre>
  </>,
  { footer: Footer },
);

export default [Cover, Body] satisfies DocEntry[];
