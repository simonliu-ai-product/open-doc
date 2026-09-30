import logo from '@assets/northwind-logo.svg';
import {
  DataTable,
  type DesignSystem,
  Diagram,
  type DocEntry,
  type DocMeta,
  type DocPage,
  Figure,
  Footnote,
  flow,
  ImagePlaceholder,
  ListOfFigures,
  ListOfTables,
  Ref,
  TableOfContents,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
import type { CSSProperties } from 'react';
import metrics from './data/metrics.csv';
import pipeline from './pipeline.mmd';

// A deliberately awkward document: every construct the Word export has to
// carry, pushed toward its edge — mixed scripts, nested formatting, spanning
// cells, a page-long table, drawings, positioned covers, a dozen footnotes.

export const meta: DocMeta = {
  title: 'DOCX 壓力測試 — Stress Test',
  subtitle: '把 Word 匯出推到極限',
  author: '平台工程部 Platform Engineering',
  createdAt: '2026-09-30T00:00:00.000Z',
  labels: { figure: '圖', table: '表' },
};

export const design: DesignSystem = {
  palette: { bg: '#ffffff', text: '#16181d', muted: '#6b7280', accent: '#c2410c', rule: '#e5e7eb' },
  fonts: {
    heading: '"Noto Serif TC", Georgia, serif',
    body: '"Noto Sans TC", "Helvetica Neue", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, Menlo, monospace',
  },
  typeScale: { title: 48, h1: 26, h2: 20, h3: 16, body: 13, caption: 10 },
  margin: 72,
  leading: 1.6,
  radius: 4,
};

const page: CSSProperties = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  padding: 'var(--od-margin)',
  background: 'var(--od-bg)',
  color: 'var(--od-text)',
  fontFamily: 'var(--od-font-body)',
  fontSize: 'var(--od-size-body)',
  lineHeight: 'var(--od-leading)',
  position: 'relative',
};

const heading = (size: string, margin: string): CSSProperties => ({
  fontFamily: 'var(--od-font-heading)',
  fontSize: size,
  fontWeight: 700,
  lineHeight: 1.25,
  margin,
});

const h1 = heading('var(--od-size-h1)', '0 0 14px');
const h2 = heading('var(--od-size-h2)', '22px 0 10px');
const h3 = heading('var(--od-size-h3)', '18px 0 8px');
const h4 = heading('15px', '14px 0 6px');
const h5 = { ...heading('14px', '12px 0 6px'), fontStyle: 'italic' } as CSSProperties;
const h6 = {
  ...heading('13px', '10px 0 6px'),
  color: 'var(--od-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
} as CSSProperties;
const p: CSSProperties = { margin: '0 0 10px' };
const cell: CSSProperties = {
  border: '1px solid var(--od-rule)',
  padding: '5px 8px',
  fontSize: 11,
};
const headCell: CSSProperties = { ...cell, background: '#f3f4f6', fontWeight: 700 };

/** Running lines drawn inside fixed pages — the exporter must not repeat them as body text. */
const RunningLines = ({ label }: { label: string }) => (
  <>
    <div
      style={{
        position: 'absolute',
        top: 28,
        left: 72,
        right: 72,
        fontSize: 9,
        color: 'var(--od-muted)',
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span>CONFIDENTIAL · 機密</span>
      <span>{label}</span>
    </div>
    <div
      style={{ position: 'absolute', bottom: 28, left: 72, fontSize: 9, color: 'var(--od-muted)' }}
    >
      Northwind Platform — internal draft
    </div>
  </>
);

const Cover: DocPage = () => (
  <div style={{ ...page, padding: 0 }}>
    <div
      style={{
        position: 'absolute',
        inset: '0 0 auto 0',
        height: 260,
        background: 'var(--od-accent)',
      }}
    />
    <img
      src={logo}
      alt="Northwind"
      style={{ position: 'absolute', top: 48, left: 72, width: 120 }}
    />
    <div style={{ position: 'absolute', left: 72, right: 72, bottom: 160 }}>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--od-accent)',
        }}
      >
        Platform engineering · 平台工程
      </p>
      <h1
        data-od-outline="skip"
        style={{ ...h1, fontSize: 'var(--od-size-title)', margin: '14px 0 10px' }}
      >
        DOCX 壓力測試
        <br />
        <span style={{ fontWeight: 400, fontStyle: 'italic', color: 'var(--od-muted)' }}>
          Stress Test
        </span>
      </h1>
      <p style={{ ...p, color: 'var(--od-muted)' }}>
        第三季・2026 Q3
        <Footnote id="cover-note">
          封面註腳：以 <strong>絕對定位</strong> 擺放的封面，只能保留第一行的高度。
        </Footnote>
      </p>
    </div>
    <RunningLines label="Cover" />
  </div>
);

const Contents: DocPage = () => (
  <div style={page}>
    <h2 data-od-outline="skip" style={{ ...h1 }}>
      目錄 Contents
    </h2>
    <TableOfContents />
    <h3 data-od-outline="skip" style={h2}>
      表目錄
    </h3>
    <ListOfTables />
    <h3 data-od-outline="skip" style={h2}>
      圖目錄
    </h3>
    <ListOfFigures />
    <RunningLines label="ii" />
  </div>
);

const Footer = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 9,
      color: 'var(--od-muted)',
      borderTop: '1px solid var(--od-rule)',
      paddingTop: 6,
    }}
  >
    <span>DOCX 壓力測試 — Stress Test</span>
    <span>
      第 {useDocPageNumber()} 頁 / 共 {useDocPageCount()} 頁 · p. {useDocPageNumber()}
    </span>
  </div>
);

const Body = flow(
  <>
    <h1 style={h1}>1. 混排與行內格式 Mixed scripts & inline formatting</h1>
    <p style={p}>
      中文與 English 交錯：<strong>粗體 bold</strong>、<em>斜體 italic</em>、<u>底線 underline</u>、
      <s>刪除線 strikethrough</s>、
      <strong>
        <em>粗斜體 bold-italic</em>
      </strong>
      、上標 x<sup>2</sup>、下標 H<sub>2</sub>O、
      <span style={{ color: '#16a34a' }}>綠色文字</span>、
      <span style={{ fontSize: 18 }}>大一點的字</span>、
      <span style={{ fontSize: 10 }}>小一點的字</span>、行內程式碼{' '}
      <code>npx open-doc export --format docx</code>。
      <Footnote id="n-inline">
        註腳裡也有格式：<strong>粗體</strong>、<code>code</code>、還有
        <a href="https://github.com/simonliu-ai-product/open-doc/issues/35">連結 #35</a>。
      </Footnote>
    </p>
    <p style={p}>
      巢狀連結：
      <a href="https://example.com/nested">
        一個連結裡有 <strong>粗體</strong> 和 <code>code</code>
      </a>
      ；站內錨點
      <a href="#section-tables">跳到表格章節</a>（Word 沒有書籤，只保留文字）。特殊字元：&amp;
      &lt;tag&gt; "雙引號" 'single' © ™ ® § ¶ — – … 🚀 🧪 ✅ ¼ ½ ¾ ∑ √ ∞ ≠ ≤ ≥ → ←。
    </p>
    <p style={p}>
      超長不斷行的網址：
      https://example.com/a/really/long/path/that/never/breaks/because/it/has/no/spaces/at/all/and/keeps/going/and/going/until/the/column/ends/index.html?query=%E4%B8%AD%E6%96%87&amp;x=1
    </p>
    <p style={p}>
      換行測試第一行
      <br />
      第二行（&lt;br /&gt;）
      <br />
      <br />
      空了一行之後的第四行。
      <Footnote>第二則註腳：純文字。</Footnote>
    </p>
    <p style={{ ...p, textAlign: 'center' }}>置中對齊的段落 · centered paragraph</p>
    <p style={{ ...p, textAlign: 'right' }}>靠右對齊的段落 · right-aligned paragraph</p>
    <p style={{ ...p, textAlign: 'justify' }}>
      左右對齊的段落：這一段刻意寫得比較長，讓左右對齊可以在中英文混排的情況下被看出來 — justified
      text mixes Latin words and 漢字 so the spacing Word chooses is visible across the whole line,
      not just at its end.
      <Footnote>第三則註腳，在左右對齊的段落裡。</Footnote>
    </p>

    <h2 style={h2}>1.1 標題層級 Heading levels</h2>
    <h3 style={h3}>1.1.1 第三層 H3</h3>
    <p style={p}>H3 之下的內文。</p>
    <h4 style={h4}>第四層 H4</h4>
    <p style={p}>H4 之下的內文。</p>
    <h5 style={h5}>第五層 H5（斜體）</h5>
    <p style={p}>H5 之下的內文。</p>
    <h6 style={h6}>Sixth level h6 (uppercase, tracked)</h6>
    <p style={p}>H6 之下的內文。</p>

    <h1 style={h1}>2. 清單 Lists</h1>
    <ul style={p}>
      <li>
        第一層項目 <strong>粗體</strong> 與 <code>code</code>
        <ol>
          <li>
            第二層編號一
            <ul>
              <li>第三層項目 A</li>
              <li>
                第三層項目 B<Footnote>清單裡的註腳。</Footnote>
              </li>
            </ul>
          </li>
          <li>第二層編號二</li>
        </ol>
      </li>
      <li>
        第一層項目二，這一項比較長，長到需要換行才能放下，用來確認懸掛縮排 hanging indent 在 Word
        裡對齊。
      </li>
    </ul>
    <ol style={p}>
      <li>另一個編號清單，應該從 1 重新開始</li>
      <li>第二項</li>
      <li>第三項</li>
    </ol>

    <h1 style={h1}>3. 引言與程式碼 Quotes & code</h1>
    <blockquote
      style={{
        ...p,
        borderLeft: '3px solid var(--od-accent)',
        paddingLeft: 12,
        color: 'var(--od-muted)',
      }}
    >
      「不能在 Word 裡改的文件，就不是給審閱者的文件。」— 某位審閱者
      <Footnote>引言裡的註腳。</Footnote>
    </blockquote>
    <pre
      style={{
        fontFamily: 'var(--od-font-mono)',
        fontSize: 11,
        background: '#f8fafc',
        padding: 10,
        margin: '0 0 10px',
        whiteSpace: 'pre-wrap',
      }}
    >
      {`// 縮排、tab、特殊字元、超長行
function export(doc) {
	if (doc.pages < 1) return null; // tab 縮排
    const xml = \`<w:t xml:space="preserve">\${escape(doc.title)} & friends</w:t>\`;
    return zip({ "word/document.xml": xml }); // a very long line that keeps going far past the right edge of the column so it has to wrap
}`}
    </pre>

    <h1 id="section-tables" style={h1}>
      4. 表格 Tables
    </h1>
    <p style={p}>
      <Ref to="t-merged" /> 有跨欄與表頭，
      <Ref to="t-wide" /> 有八欄，
      <Ref to="t-metrics" /> 從 CSV 來。
    </p>
    <Figure id="t-merged" kind="table" caption="跨欄、對齊與空白儲存格">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={headCell} rowSpan={1}>
              區域
            </th>
            <th style={{ ...headCell, textAlign: 'center' }} colSpan={2}>
              延遲 Latency
            </th>
            <th style={{ ...headCell, textAlign: 'right' }}>費用</th>
          </tr>
          <tr>
            <th style={headCell}></th>
            <th style={{ ...headCell, textAlign: 'right' }}>p50</th>
            <th style={{ ...headCell, textAlign: 'right' }}>p99</th>
            <th style={{ ...headCell, textAlign: 'right' }}>USD</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cell}>台北 Taipei</td>
            <td style={{ ...cell, textAlign: 'right' }}>42 ms</td>
            <td style={{ ...cell, textAlign: 'right' }}>
              <strong>412 ms</strong>
            </td>
            <td style={{ ...cell, textAlign: 'right' }}>$48,120</td>
          </tr>
          <tr>
            <td style={cell}>東京 Tokyo</td>
            <td style={{ ...cell, textAlign: 'right' }}></td>
            <td style={{ ...cell, textAlign: 'right', color: '#dc2626' }}>1,204 ms</td>
            <td style={{ ...cell, textAlign: 'right' }}>—</td>
          </tr>
          <tr>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={3}>
              合計 Total（跨三欄）
            </td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>$48,120</td>
          </tr>
        </tbody>
      </table>
    </Figure>
    <Figure id="t-wide" kind="table" caption="八欄的寬表格">
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {['欄一', 'Column two', '三', 'Four', '五五五五', 'Six', '七', 'Eight 8'].map(
              (label) => (
                <th key={label} style={headCell}>
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((row) => (
            <tr key={row}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((col) => (
                <td key={col} style={cell}>
                  {row === 2 && col === 5
                    ? '非常非常長的儲存格內容會換行 wraps inside the cell'
                    : `R${row}C${col}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
    <DataTable
      id="t-metrics"
      caption="各區域各服務指標（CSV，26 列）"
      rows={metrics}
      compact
      columns={[
        { key: 'region', label: '區域', width: 64 },
        { key: 'service', label: '服務', width: 96 },
        { key: 'requests', label: '請求數', format: 'integer' },
        { key: 'p99_ms', label: 'p99', format: 'integer', width: 48 },
        { key: 'error_rate', label: '錯誤率', format: 'percent', width: 56 },
        { key: 'cost', label: '月費', format: 'integer', width: 64 },
        { key: 'note', label: '備註' },
      ]}
    />

    <h1 style={h1}>5. 圖 Figures</h1>
    <Diagram chart={pipeline} caption="資料管線（Mermaid 編譯）" id="f-pipeline" width={560} />
    <Figure id="f-bars" caption="用 div 畫的長條圖">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 10,
          height: 140,
          padding: 12,
          border: '1px solid var(--od-rule)',
          borderRadius: 'var(--od-radius)',
        }}
      >
        {[90, 40, 65, 120, 25, 80].map((height, at) => (
          <div
            key={height}
            style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--od-muted)' }}
          >
            <div
              style={{
                height,
                background: at === 3 ? 'var(--od-accent)' : '#94a3b8',
                borderRadius: 2,
              }}
            />
            {['一', '二', '三', '四', '五', '六'][at]}
          </div>
        ))}
      </div>
    </Figure>
    <Figure id="f-svg" caption="手寫的 inline SVG">
      <svg viewBox="0 0 300 80" width="300" height="80" role="img" aria-label="sparkline">
        <polyline
          points="0,70 40,50 80,60 120,20 160,35 200,10 240,40 300,5"
          fill="none"
          stroke="#c2410c"
          strokeWidth="3"
        />
        <circle cx="200" cy="10" r="5" fill="#16181d" />
      </svg>
    </Figure>
    <Figure id="f-logo" caption="SVG 圖檔（Word 需要轉成 PNG）">
      <img src={logo} alt="Northwind logo" style={{ width: 200 }} />
    </Figure>
    <ImagePlaceholder hint="預留圖位：Q4 的架構圖會放在這裡" height={90} />
    <p style={p}>
      最後一段引用了 <Ref to="f-pipeline" /> 與 <Ref to="f-bars" />
      ，以及一則最後的註腳。
      <Footnote>最後一則註腳，含 emoji 🎯 與符號 &lt;&amp;&gt;。</Footnote>
    </p>
    <hr style={{ border: 0, borderTop: '1px solid var(--od-rule)', margin: '16px 0' }} />
    <p style={{ ...p, fontSize: 11, color: 'var(--od-muted)' }}>
      超長單字：Pneumonoultramicroscopicsilicovolcanoconiosis_and_then_some_more_characters_without_any_break_opportunity_at_all。
    </p>
  </>,
  { footer: Footer },
);

const Closing: DocPage = () => (
  <div
    style={{
      ...page,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center',
    }}
  >
    <h2 data-od-outline="skip" style={{ ...h1, fontSize: 36 }}>
      完 · The End
    </h2>
    <p style={{ ...p, color: 'var(--od-muted)' }}>
      這一頁內容垂直置中，應該在 Word 裡也落在頁面中段。
    </p>
    <RunningLines label="End" />
  </div>
);

export default [Cover, Contents, Body, Closing] satisfies DocEntry[];
