import {
  Chart,
  DataTable,
  type DesignSystem,
  Diagram,
  type DocEntry,
  type DocMeta,
  type DocPage,
  Figure,
  Footnote,
  flow,
  ListOfFigures,
  ListOfTables,
  Ref,
  TableOfContents,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
import type { CSSProperties, ReactNode } from 'react';
import usage from './data/usage.csv';
import workflow from './workflow.mmd';

export const meta: DocMeta = {
  title: 'open-doc 使用手冊',
  subtitle: '撰寫、編輯與匯出文件的完整指南',
  author: 'open-doc',
  createdAt: '2026-10-01T00:00:00.000Z',
  labels: { figure: '圖', table: '表' },
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
    heading: '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", -apple-system, sans-serif',
    body: '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", -apple-system, sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  typeScale: { title: 44, h1: 26, h2: 18, h3: 15, body: 13, caption: 10 },
  margin: 72,
  leading: 1.7,
  radius: 6,
};

const page: CSSProperties = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  padding: 'var(--od-margin)',
  position: 'relative',
};

const h1: CSSProperties = {
  fontSize: 'var(--od-size-h1)',
  fontWeight: 650,
  letterSpacing: '-0.01em',
  margin: '6px 0 12px',
};
const h2: CSSProperties = { fontSize: 'var(--od-size-h2)', fontWeight: 600, margin: '18px 0 8px' };
const p: CSSProperties = { margin: '0 0 10px' };
const list: CSSProperties = { margin: '0 0 10px' };
const cell: CSSProperties = {
  borderBottom: '1px solid var(--od-rule)',
  padding: '5px 8px',
  fontSize: 11.5,
  textAlign: 'left',
  verticalAlign: 'top',
};
const head: CSSProperties = { ...cell, fontWeight: 600, color: 'var(--od-muted)', fontSize: 10.5 };

const Code = ({ children }: { children: string }) => (
  <pre
    style={{
      fontSize: 11,
      lineHeight: 1.55,
      background: '#f6f7f9',
      border: '1px solid var(--od-rule)',
      borderRadius: 'var(--od-radius)',
      padding: '10px 12px',
      margin: '0 0 12px',
      whiteSpace: 'pre-wrap',
    }}
  >
    {children}
  </pre>
);

const Tip = ({ children }: { children: ReactNode }) => (
  <blockquote
    style={{
      margin: '2px 0 12px',
      padding: '8px 12px',
      background: '#eff4ff',
      borderLeft: '3px solid var(--od-accent)',
      color: 'var(--od-text)',
      fontSize: 12,
    }}
  >
    {children}
  </blockquote>
);

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd
    style={{
      fontFamily: 'var(--od-font-mono)',
      fontSize: '0.85em',
      padding: '0 4px',
      border: '1px solid var(--od-rule)',
      borderRadius: 3,
      background: '#f6f7f9',
    }}
  >
    {children}
  </kbd>
);

const Table = ({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', margin: 0 }}>
    <thead>
      <tr>
        {columns.map((column) => (
          <th key={column} style={head}>
            {column}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row, at) => (
        <tr key={at}>
          {row.map((value, column) => (
            <td key={column} style={column === 0 ? { ...cell, whiteSpace: 'nowrap' } : cell}>
              {value}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

const Header = () => (
  <div
    style={{
      position: 'absolute',
      top: 34,
      left: 'var(--od-margin)',
      right: 'var(--od-margin)',
      fontSize: 'var(--od-size-caption)',
      color: 'var(--od-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    }}
  >
    open-doc · 使用手冊
  </div>
);

const Footer = () => (
  <div
    style={{
      position: 'absolute',
      left: 'var(--od-margin)',
      right: 'var(--od-margin)',
      bottom: 36,
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 'var(--od-size-caption)',
      color: 'var(--od-muted)',
      borderTop: '1px solid var(--od-rule)',
      paddingTop: 8,
    }}
  >
    <span>open-doc 使用手冊</span>
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {useDocPageNumber()} / {useDocPageCount()}
    </span>
  </div>
);

const Cover: DocPage = () => (
  <div style={{ ...page, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
    <p
      style={{
        fontSize: 12,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--od-accent)',
        margin: '0 0 16px',
      }}
    >
      open-doc · 使用手冊
    </p>
    <h1
      data-od-outline="skip"
      style={{ ...h1, fontSize: 'var(--od-size-title)', lineHeight: 1.1, margin: '0 0 16px' }}
    >
      open-doc 使用手冊
    </h1>
    <p style={{ ...p, fontSize: 15, color: 'var(--od-muted)', maxWidth: 470 }}>
      完整的使用手冊：檢視器、在頁面上編輯、撰寫文件、資料與圖表、匯出、命令列，以及和 coding agent
      一起工作。手冊裡介紹的大部分功能，這份文件本身就有用到，可以邊讀邊試。
    </p>
    <p style={{ ...p, marginTop: 36, fontSize: 11, color: 'var(--od-muted)' }}>
      English edition: getting-started · 不再需要時，兩份都可以刪除。
    </p>
  </div>
);

const Contents: DocPage = () => (
  <div style={page}>
    <h2 data-od-outline="skip" style={h1}>
      目錄
    </h2>
    <TableOfContents maxLevel={1} />
  </div>
);

const Lists: DocPage = () => (
  <div style={page}>
    <h2 data-od-outline="skip" style={h1}>
      表與圖
    </h2>
    <h3 data-od-outline="skip" style={h2}>
      表目錄
    </h3>
    <ListOfTables />
    <h3 data-od-outline="skip" style={h2}>
      圖目錄
    </h3>
    <ListOfFigures />
  </div>
);

const Part = ({ children }: { children: ReactNode }) => (
  <p
    style={{
      margin: '6px 0 4px',
      fontSize: 11,
      letterSpacing: '0.16em',
      color: 'var(--od-accent)',
      fontWeight: 600,
    }}
  >
    {children}
  </p>
);

const Body = flow(
  <>
    <Part>第一部分 · 使用 open-doc</Part>
    <h1 style={h1}>1. open-doc 是什麼</h1>
    <p style={p}>
      open-doc 把 React 元件變成印刷品質的文件，例如報告、提案、白皮書與規格書。你（或 coding
      agent）用 TSX
      撰寫每一份文件；框架負責給每一頁一張真實尺寸的紙、產生大綱與目錄、替圖表和註腳編號、把長篇內容自動分頁，並匯出成
      PDF、Word、HTML 或圖片。
    </p>
    <p style={p}>整個工具建立在四個概念上：</p>
    <ul style={list}>
      <li>
        <strong>工作區</strong>：一個資料夾，裡面有 <code>docs/</code>（每份文件一個資料夾）、共用的{' '}
        <code>assets/</code>、選用的 <code>themes/</code>，以及 <code>open-doc.config.ts</code>。
      </li>
      <li>
        <strong>文件</strong>：<code>docs/&lt;id&gt;/index.tsx</code>，匯出 <code>meta</code>
        、選用的 <code>design</code>，以及它的頁面。
      </li>
      <li>
        <strong>頁面</strong>：自己排版的固定頁（例如封面），或由框架自動分頁的 <code>flow()</code>{' '}
        區段（例如內文）。
      </li>
      <li>
        <strong>設計</strong>
        ：一個包含顏色、字型、字級與邊界的物件，所有頁面都從這裡取值，所以換一套風格只要改一個地方。
      </li>
    </ul>
    <p style={p}>
      它的設計是「由 agent 撰寫、由人審閱」。
      <Ref to="f-workflow" />
      是整個流程：你提出需求、agent 撰寫、你在頁面上修正，最後匯出。
    </p>
    <Diagram
      chart={workflow}
      id="f-workflow"
      caption="open-doc 的工作流程：撰寫、檢視與修正、匯出"
    />

    <h1 style={h1}>2. 安裝與建立工作區</h1>
    <p style={p}>需要 Node.js 18 以上。用 scaffolder 建立工作區，再啟動開發伺服器：</p>
    <Code>{`npx @open-document/cli init my-docs
cd my-docs
pnpm install          # 或 npm install
pnpm dev              # open-doc dev → http://localhost:5273`}</Code>
    <p style={p}>新的工作區長這樣：</p>
    <Code>{`my-docs/
  docs/
    getting-started/      ← 英文版手冊
    getting-started-zh/   ← 這份中文版手冊
  assets/                 ← 所有文件共用的圖片
  themes/                 ← 選用的文件風格（Markdown）
  .agents/skills/         ← 給 coding agent 的說明
  open-doc.config.ts
  package.json`}</Code>
    <p style={p}>
      <code>open-doc.config.ts</code> 可以不寫，每個設定都有預設值（
      <Ref to="t-config" />
      ）。
    </p>
    <Figure id="t-config" kind="table" caption="open-doc.config.ts 的設定項目">
      <Table
        columns={['設定', '預設值', '用途']}
        rows={[
          [<code key="a">docsDir</code>, <code key="b">docs</code>, '文件放在哪裡。'],
          [<code key="a">assetsDir</code>, <code key="b">assets</code>, '共用圖片。'],
          [<code key="a">themesDir</code>, <code key="b">themes</code>, '主題說明文件。'],
          [<code key="a">port</code>, <code key="b">5273</code>, '開發伺服器的連接埠。'],
          [
            <code key="a">allowedHosts</code>,
            '—',
            '開發伺服器接受的主機名稱，例如透過通道存取時。',
          ],
          [<code key="a">base</code>, <code key="b">/</code>, '靜態網站的網址前綴。'],
          [<code key="a">home</code>, '—', '嵌入其他網站時，檢視器左上返回鍵要回到哪裡。'],
          [
            <code key="a">build.showDocBrowser</code>,
            <code key="b">true</code>,
            '靜態網站是否包含文件列表。',
          ],
          [
            <code key="a">build.allowHtmlExport</code>,
            <code key="b">true</code>,
            '靜態網站的下載選單是否提供 HTML。',
          ],
        ]}
      />
    </Figure>

    <h1 style={h1}>3. 文件瀏覽器</h1>
    <p style={p}>
      首頁會依建立時間列出所有文件，最新的在前面，每份都有第一頁的即時縮圖。左側欄負責整理：
    </p>
    <ul style={list}>
      <li>
        <strong>資料夾</strong>：<em>New folder</em> 建立資料夾，可以設定圖示與顏色（
        <em>Change icon</em>），也能重新命名或刪除。資料夾只是分組，檔案不會在磁碟上移動，分組記錄在{' '}
        <code>docs/.folders.json</code>。
      </li>
      <li>
        <strong>文件選單</strong>（卡片上的 ⋯）：<em>Rename</em> 重新命名、<em>Duplicate</em> 複製、
        <em>Move to</em> 移到資料夾（或 <em>Unfiled</em> 未分類）、<em>Delete</em> 刪除。
      </li>
      <li>
        <strong>Themes</strong>：<code>themes/</code> 裡的文件風格，每個都有說明與示範頁。
      </li>
      <li>
        <strong>Assets</strong>：工作區裡所有圖片，顯示大小；沒有任何文件使用時會標上{' '}
        <em>unused</em>，並提供可直接貼上的 import 語法。
      </li>
    </ul>

    <h1 style={h1}>4. 閱讀文件</h1>
    <p style={p}>
      打開文件後，每一頁都以真實尺寸顯示在畫布上。工具列（
      <Ref to="t-toolbar" />
      ）依用途分組：左邊是位置，中間是怎麼看，右邊是要對文件做什麼。
    </p>
    <Figure id="t-toolbar" kind="table" caption="檢視器工具列，由左到右">
      <Table
        columns={['控制項', '功能']}
        rows={[
          ['← 與標題', '回到文件列表。'],
          [
            '頁碼欄',
            <>
              輸入頁碼後按 <Kbd>Enter</Kbd> 跳到該頁。
            </>,
          ],
          [
            '− 100% + ▾',
            <>
              縮放。在欄位裡輸入比例（例如 <code>150</code>），或用 ▾ 選擇 Fit
              width（符合寬度）、Fit page（符合頁面）、Actual
              size（實際大小）與常用比例（25–200%）。
            </>,
          ],
          ['版面', '連續、兩頁並排，或多頁格狀。'],
          [
            '全螢幕',
            <>
              閱讀模式，也可以按 <Kbd>F</Kbd>。
            </>,
          ],
          ['搜尋', '在所有頁面中尋找文字，符合處直接在頁面上標示。'],
          ['Preview / Edit', '閱讀模式或在頁面上編輯（僅開發伺服器）。'],
          [
            'Design',
            <>
              設計面板，也可以按 <Kbd>D</Kbd>（僅開發伺服器）。
            </>,
          ],
          ['Download', '匯出全部頁面、目前這頁，或自訂範圍（見第 16 節）。'],
        ]}
      />
    </Figure>
    <p style={p}>
      左側欄有三個分頁：<strong>Pages</strong> 顯示縮圖，點一下就跳過去；
      <strong>Outline</strong> 列出標題與所在頁碼；<strong>Assets</strong>
      管理這份文件與整個工作區的圖片。你選的版面會依文件記住。
    </p>

    <h1 style={h1}>5. 在頁面上編輯</h1>
    <p style={p}>
      開發伺服器執行中時，切到 <strong>Edit</strong>
      ，在任何文字上按兩下：標題、段落、清單項目、表格儲存格、圖說、註腳都可以。你直接在頁面上打字；修改會先暫存，底部的卡片會顯示數量，按下儲存後才一次寫回文件的原始碼。
    </p>
    <Figure id="t-keys" kind="table" caption="在頁面上編輯文字時的按鍵">
      <Table
        columns={['按鍵', '動作']}
        rows={[
          [<Kbd key="b">⌘B</Kbd>, '粗體'],
          [<Kbd key="i">⌘I</Kbd>, '斜體'],
          [<Kbd key="e">⌘E</Kbd>, '行內程式碼'],
          [<Kbd key="k">⌘K</Kbd>, '新增或編輯連結'],
          [<Kbd key="c">⌘\</Kbd>, '清除格式'],
          [<Kbd key="n">Shift+Enter</Kbd>, '在文字中換行'],
          [<Kbd key="esc">Esc</Kbd>, '還原這個欄位的修改並離開'],
          [<Kbd key="s">⌘S</Kbd>, '儲存所有暫存的修改'],
          [<Kbd key="z">⌘Z / ⇧⌘Z</Kbd>, '復原／重做'],
        ]}
      />
    </Figure>
    <p style={p}>
      選取文字時會出現小型格式工具列，功能與上表相同。來自資料的文字（例如匯入的 <code>.csv</code>{' '}
      的一列）不能在頁面上編輯，面板會告訴你要改哪個檔案。
    </p>
    <h2 style={h2}>給 agent 的註解</h2>
    <p style={p}>
      在 Edit 模式點一下元素，右側會打開元素面板。在 <em>Comment for the agent</em>{' '}
      寫下你想改的地方，例如「改成表格」「縮短成兩句」，再按 <em>Mark comment</em>
      。註解會存在原始碼中該元素旁邊；之後請 agent「套用註解」，它就會逐一處理。
    </p>
    <Tip>
      現在就試試：切到 Edit，在封面的「使用手冊」上按兩下，改幾個字，按 <Kbd>⌘S</Kbd>。再打開{' '}
      <code>docs/getting-started-zh/index.tsx</code>，你的修改已經在原始碼裡了。
    </Tip>

    <h1 style={h1}>6. 設計面板</h1>
    <p style={p}>
      按 <Kbd>D</Kbd> 或點 <strong>Design</strong>。面板即時編輯文件的 <code>design</code>{' '}
      物件，拖動時每一頁都會跟著重畫；它也像文字修改一樣存回原始碼，而且可以復原。
      <Ref to="t-design" /> 列出它控制的項目；每個值都會變成 CSS 變數，你自己寫的元件也能使用。
    </p>
    <Figure id="t-design" kind="table" caption="設計項目與對應的 CSS 變數">
      <Table
        columns={['項目', 'CSS 變數', '用途']}
        rows={[
          [
            'palette.bg / text / muted',
            <code key="v">--od-bg --od-text --od-muted</code>,
            '紙張、內文、次要文字',
          ],
          [
            'palette.accent / rule',
            <code key="v">--od-accent --od-rule</code>,
            '連結、強調色、圖表；細線',
          ],
          [
            'fonts.heading / body / mono',
            <code key="v">--od-font-heading …</code>,
            '字型堆疊，包含中文字型',
          ],
          ['typeScale.title … caption', <code key="v">--od-size-h1 …</code>, '字級（px）'],
          [
            'margin · leading · radius',
            <code key="v">--od-margin --od-leading</code>,
            '頁面邊界、行高、圓角',
          ],
        ]}
      />
    </Figure>

    <Part>第二部分 · 撰寫文件</Part>
    <h1 style={h1}>7. 文件檔案</h1>
    <p style={p}>一份文件的 index.tsx 匯出三樣東西：</p>
    <Code>{`export const meta: DocMeta = {
  title: '第三季可靠度報告',
  subtitle: '平台層',
  author: '平台工程部',
  pageSize: 'A4',            // 'A4' | 'B4' | 'A3'
  orientation: 'portrait',   // 或 'landscape'
  createdAt: '2026-10-01T00:00:00.000Z',
  labels: { figure: '圖', table: '表' },   // 選用
};

export const design: DesignSystem = { /* 第 6 節 */ };

export default [Cover, Contents, Body] satisfies DocEntry[];`}</Code>
    <p style={p}>
      頁面以 96 dpi 的 CSS 像素畫在精確尺寸的紙上（
      <Ref to="t-sizes" />
      ），所以螢幕上的版面就是紙上的版面。只有這三種尺寸（直式或橫式）。
    </p>
    <Figure id="t-sizes" kind="table" caption="紙張尺寸（直式）">
      <Table
        columns={['pageSize', '紙張', 'CSS px']}
        rows={[
          ['A4', '210 × 297 mm', '794 × 1123'],
          ['B4', '257 × 364 mm（JIS）', '971 × 1376'],
          ['A3', '297 × 420 mm', '1123 × 1587'],
        ]}
      />
    </Figure>

    <h1 style={h1}>8. 固定頁與自動分頁</h1>
    <p style={p}>
      頁面清單中的一個元件就是一張<strong>固定頁</strong>
      ：所有東西由你擺放，不會跑到別頁，適合封面、標題頁與海報。
      <code>flow()</code>{' '}
      區段則放連續的內容：框架在真正的瀏覽器裡量測每個區塊，再把它們排進需要的頁數。
    </p>
    <Code>{`import { flow } from '@open-document/core';

const Body = flow(
  <>
    <h1>1. 主要發現</h1>
    <p>fragment 的每個直接子元素就是一個區塊。</p>
    <Chart … />
  </>,
  { header: Header, footer: Footer, padding: 72 },
);`}</Code>
    <ul style={list}>
      <li>
        <strong>區塊不會被切開。</strong>
        段落、表格或圖表會完整落在同一頁；很長的表格若必須跨頁，請拆成兩個區塊。
      </li>
      <li>
        <strong>頁首與頁尾</strong>會畫在區段的每一頁、位於邊界區域；裡面可以使用{' '}
        <code>useDocPageNumber()</code> 與 <code>useDocPageCount()</code>
        。這份手冊的頁首和頁尾就是這樣做的。
      </li>
      <li>
        <strong>padding</strong> 可以只覆寫這個區段的邊界。
      </li>
    </ul>
    <Figure id="t-keep" kind="table" caption="控制分頁的規則">
      <Table
        columns={['屬性', '效果']}
        rows={[
          ['（標題）', '標題不會留在頁尾，會跟著下一個區塊移到下一頁。'],
          [<code key="a">data-od-keep-with-next</code>, '這個區塊和下一個區塊放在同一頁。'],
          [
            <code key="a">data-od-keep-with-previous</code>,
            '這個區塊和上一個區塊放在同一頁，例如圖下方的圖說。',
          ],
          [<code key="a">data-od-break-before</code>, '一定從這裡開始新的一頁。'],
        ]}
      />
    </Figure>
    <p style={p}>
      沒有寫樣式的元素也會套用文件的設計：<code>&lt;h2&gt;</code> 會以 h2 字級顯示粗體、
      <code>&lt;ul&gt;</code> 有項目符號、連結使用強調色。你寫的 inline style 會覆寫這些預設。
    </p>

    <h1 style={h1}>9. 標題、大綱與目錄</h1>
    <p style={p}>
      真正的 <code>h1</code>、<code>h2</code>、<code>h3</code> 會成為左側欄的大綱、
      <code>&lt;TableOfContents /&gt;</code> 的項目，以及匯出 PDF
      的書籤。三者來自同一次掃描，頁碼是標題實際所在的頁。
    </p>
    <ul style={list}>
      <li>
        <code>&lt;TableOfContents maxLevel={'{2}'} /&gt;</code> 會自動填入內容與頁碼，不要手寫目錄。
      </li>
      <li>
        <code>data-od-outline="skip"</code> 讓標題不列入大綱，例如封面標題、「目錄」兩個字。
      </li>
      <li>
        <code>data-od-heading="短標題"</code> 設定長標題在大綱中顯示的文字，也能讓任何元素成為標題。
      </li>
    </ul>

    <h1 style={h1}>10. 圖、表與交互參照</h1>
    <p style={p}>
      用 <code>&lt;Figure id caption&gt;</code> 包住圖片或表格（表格加上 <code>kind="table"</code>
      ），就會依文件順序編號。<code>&lt;Ref to="id" /&gt;</code> 會印出編號，這份手冊裡提到{' '}
      <Ref to="t-keys" /> 和 <Ref to="f-chart" /> 的地方都是真的參照；
      <code>&lt;ListOfFigures /&gt;</code> 與 <code>&lt;ListOfTables /&gt;</code>{' '}
      會在目錄頁建立清單。<code>meta.labels</code> 可以改名稱，例如這份手冊用的「圖」與「表」。
    </p>

    <h1 style={h1}>11. 註腳</h1>
    <p style={p}>
      在需要的地方寫 <code>&lt;Footnote&gt;…&lt;/Footnote&gt;</code>
      <Footnote>就像這一則。它會印在記號所在那一頁的底部。</Footnote>
      。在 flow 區段中，框架會把註腳移到記號所在那頁的底部，並在分頁時預留空間；在固定頁上，則把{' '}
      <code>&lt;Footnotes /&gt;</code> 放在註腳要印出的位置。
    </p>

    <h1 style={h1}>12. 資料、表格與圖表</h1>
    <p style={p}>
      數字應該來自檔案，而不是重新打一次。匯入 <code>.csv</code> 或 <code>.tsv</code>{' '}
      會得到一個資料列陣列，數字保持數字；用 <code>&lt;DataTable&gt;</code> 印出來，
      <Ref to="t-usage" /> 就是這份手冊的範例檔：
    </p>
    <Code>{`import usage from './data/usage.csv';

<DataTable rows={usage} caption="使用量" columns={[
  { key: 'month', label: '月份' },
  { key: 'documents', label: '文件數', format: 'integer' },
]} />`}</Code>
    <DataTable
      id="t-usage"
      caption="data/usage.csv，以 DataTable 印出"
      rows={usage}
      columns={[
        { key: 'month', label: '月份' },
        { key: 'documents', label: '文件數', format: 'integer' },
        { key: 'exports', label: '匯出次數', format: 'integer' },
      ]}
    />
    <p style={p}>
      <code>columns</code> 用來挑選欄位、設定標題、對齊與格式（<code>number</code>、
      <code>integer</code>、<code>percent</code> 或自訂函式）；<code>limit</code> 限制列數；
      <code>compact</code> 讓列距更緊。同一份資料用 <code>&lt;Chart&gt;</code> 畫成圖：
    </p>
    <Code>{`<Chart data={usage} x="month" y={['documents', 'exports']}
       labels={{ documents: '文件數', exports: '匯出次數' }}
       caption="每月文件數與匯出次數" />`}</Code>
    <Chart
      id="f-chart"
      data={usage}
      x="month"
      y={['documents', 'exports']}
      labels={{ documents: '文件數', exports: '匯出次數' }}
      height={210}
      caption="每月文件數與匯出次數，以 Chart 繪製"
    />
    <p style={p}>
      <code>type</code> 可以是 <code>bar</code>、<code>line</code> 或 <code>pie</code>；
      <code>stacked</code> 堆疊柱狀；<code>values</code> 印出每個數值；<code>format</code>{' '}
      設定刻度與數值格式；<code>width</code>、<code>height</code>、<code>colors</code>{' '}
      調整圖形。圖表使用強調色及其色調，所以會跟著設計改變。
    </p>

    <h1 style={h1}>13. 流程圖</h1>
    <p style={p}>
      把流程圖寫成 <code>.mmd</code> 文字檔（Mermaid flowchart
      語法的實用子集）再匯入。它會在建置時編譯成使用文件配色的圖；
      <Ref to="f-workflow" /> 就是這份手冊的流程圖。
    </p>
    <Code>{`flowchart LR
  Ask[請 agent 撰寫] --> Write[index.tsx]
  Write --> View{檢視器}
  View -->|在頁面上修改| Write
  View ==> Export([PDF · Word · HTML])`}</Code>
    <ul style={list}>
      <li>
        方向 <code>TD</code> 與 <code>LR</code>。節點 <code>A[方框]</code>、<code>A(圓角)</code>、
        <code>A([膠囊])</code>、<code>A[(資料庫)]</code>、<code>A{'{判斷}'}</code>、
        <code>A((圓形))</code>。
      </li>
      <li>
        連線 <code>--&gt;</code>、<code>---</code>、<code>-.-&gt;</code>、<code>==&gt;</code>，可加{' '}
        <code>|標籤|</code>。連回前面步驟的線會從旁邊繞過。
      </li>
      <li>
        <code>&lt;Diagram chart={'{…}'} caption width /&gt;</code>{' '}
        放置流程圖；寫錯時建置會失敗，並指出要修正的行。
      </li>
    </ul>

    <h1 style={h1}>14. 圖片與素材</h1>
    <p style={p}>
      圖片像程式碼一樣 import。共用圖片放在工作區的 <code>assets/</code>，透過 <code>@assets</code>{' '}
      別名匯入；只有一份文件使用的圖片放在該文件自己的 <code>assets/</code>，用相對路徑匯入。
    </p>
    <Code>{`import logo from '@assets/logo.svg';
import photo from './assets/team.jpg';

<img src={logo} alt="公司標誌" style={{ width: 120 }} />
<ImagePlaceholder hint="架構圖放這裡" height={180} />`}</Code>
    <p style={p}>
      <code>&lt;ImagePlaceholder&gt;</code>{' '}
      替還沒準備好的圖片預留空間，圖片放進來時分頁已經是對的。Assets
      面板可以上傳、重新命名、刪除檔案，並幫你複製 import 語法。
    </p>

    <h1 style={h1}>15. 主題</h1>
    <p style={p}>
      主題是以文件形式寫成的可重複使用風格：<code>themes/</code> 裡的一個 Markdown
      檔，描述設計物件與要複製的元件（標題區、頁尾、表格），可附一個示範頁。執行時不會強制套用，文件複製需要的部分，並用{' '}
      <code>meta.theme</code> 連回主題。請 agent「從這份文件建立主題」就能萃取出一個。
    </p>

    <Part>第三部分 · 輸出與自動化</Part>
    <h1 style={h1}>16. 匯出</h1>
    <p style={p}>
      <strong>Download</strong> 選單會先問要哪些頁面：<em>All</em>（全部）、
      <em>This page</em>（這一頁），或 <em>Range</em> 自訂範圍（例如 <code>1-3, 6</code>
      ，輸入時會即時顯示解析結果 ），再選格式（
      <Ref to="t-formats" />
      ）。
    </p>
    <Figure id="t-formats" kind="table" caption="匯出格式">
      <Table
        columns={['格式', '適合用途']}
        rows={[
          [
            'PDF',
            '列印與正式交付。真實頁面尺寸；從 CLI 匯出時還會帶有每個標題的書籤，並標記給螢幕閱讀器使用。',
          ],
          [
            'Word (DOCX)',
            '在 Word 裡審閱：真正的標題樣式、目錄、註腳、表格，以及含頁碼欄位的頁首頁尾，所以追蹤修訂與註解都能用。Word 會重新分頁；繪圖以圖片呈現。',
          ],
          ['HTML', '單一、可列印的獨立檔案，方便寄送或放上網站。'],
          ['PNG', '每頁一張 2 倍解析度的圖，適合簡報與聊天。'],
          ['SVG', '每頁一個向量檔，文字保持為文字。'],
        ]}
      />
    </Figure>

    <h1 style={h1}>17. 命令列</h1>
    <p style={p}>
      所有 <code>open-doc</code> 指令都在工作區資料夾執行（
      <Ref to="t-cli" />
      ）。headless 指令會在瀏覽器裡驅動真正的檢視器，所以輸出和下載選單完全相同；它們需要
      Playwright（
      <code>pnpm add -D playwright &amp;&amp; pnpm exec playwright install chromium</code>）。
    </p>
    <Figure id="t-cli" kind="table" caption="指令與主要選項">
      <Table
        columns={['指令', '功能']}
        rows={[
          [
            <code key="c">dev [--open] [--mcp]</code>,
            '啟動有熱重載的檢視器；--mcp 會在 /mcp 提供 MCP 端點。',
          ],
          [
            <code key="c">export &lt;ids…&gt; -f pdf|html|png|docx</code>,
            '把文件寫到 out/（-o 改位置，--all 匯出全部）。',
          ],
          [
            <code key="c">check [ids…] [--json]</code>,
            '回報版面問題；有錯誤時以非零結束碼結束，可用在 CI。',
          ],
          [
            <code key="c">diff &lt;id&gt; [--since rev]</code>,
            '從某個 git 版本（預設 HEAD）以來，逐頁列出改了什麼。',
          ],
          [
            <code key="c">import &lt;file.md&gt;</code>,
            '把 Markdown 轉成文件（--id、--title、--contents、--no-cover）。',
          ],
          [<code key="c">build [--out-dir]</code>, '把所有文件建成靜態網站，放在 dist/。'],
          [<code key="c">preview</code>, '在本機預覽靜態網站。'],
          [<code key="c">sync:skills [--dry-run]</code>, '把 agent skills 更新成目前版本。'],
        ]}
      />
    </Figure>

    <h1 style={h1}>18. 檢查與審閱修改</h1>
    <p style={p}>
      <code>open-doc check</code> 會以真實尺寸畫出每一頁，回報在原始碼裡看不到的問題：內容超出頁面（
      <code>page-overflow</code>、<code>off-page</code>）、比一頁還高的區塊（
      <code>oversized-block</code>）、空白頁（<code>blank-page</code>）、留在頁尾的標題（
      <code>orphan-heading</code>）、小到無法閱讀的字（<code>tiny-text</code>）、載入失敗的圖片（
      <code>broken-image</code>），以及找不到對象的 <code>Ref</code>（<code>unresolved-ref</code>
      ）。每個問題都指向原始碼的行號。
    </p>
    <p style={p}>
      <code>open-doc diff &lt;id&gt; --since main</code>{' '}
      會畫出文件現在與過去的樣子，依內容配對頁面，逐頁列出已變更、新增、移除或未變，並列出增減的文字行。它還會寫出{' '}
      <code>out/&lt;id&gt;-diff.html</code>
      ：一份獨立的前後對照報告，變動處加框標示，可以直接寄給沒有原始碼、也沒有 open-doc 的審閱者。
    </p>

    <h1 style={h1}>19. 匯入 Markdown</h1>
    <p style={p}>
      <code>open-doc import notes.md --contents</code> 會把 Markdown
      檔轉成一般的文件：封面、選用的目錄頁，以及由真正的標題、段落、清單、表格與程式碼組成的 flow
      區段。結果是普通的
      TSX，所以這份手冊介紹的功能都能用在它身上：在頁面上編輯、用設計面板改風格、匯出。
    </p>

    <h1 style={h1}>20. 發佈靜態網站</h1>
    <p style={p}>
      <code>open-doc build</code> 會把所有文件寫成 <code>dist/</code>{' '}
      裡的靜態網站，可以放在任何主機上；<code>open-doc preview</code>{' '}
      在本機預覽。編輯、設計面板與註解只在開發模式提供，不會包含在內。用{' '}
      <code>build.showDocBrowser</code> 只發佈檢視器、用 <code>base</code> 放在子路徑下、用{' '}
      <code>home</code> 讓返回鍵回到你自己的網站。
    </p>

    <h1 style={h1}>21. 與 coding agent 合作</h1>
    <p style={p}>
      工作區在 <code>.agents/skills/</code> 附有 skills，教 agent 怎麼撰寫 open-doc 文件（
      <Ref to="t-skills" />
      ）。它們是一般的 Markdown，自己讀也很有幫助。
    </p>
    <Figure id="t-skills" kind="table" caption="內建的 agent skills">
      <Table
        columns={['Skill', '當你要求…時使用']}
        rows={[
          [<code key="s">create-doc</code>, '建立新的報告、提案或規格書'],
          [<code key="s">doc-authoring</code>, '編輯任何文件，是技術參考'],
          [<code key="s">apply-comments</code>, '套用你在頁面上留的註解'],
          [<code key="s">current-doc</code>, '處理你正在看的「這一頁」或「這個元素」'],
          [<code key="s">create-theme</code>, '建立或萃取文件風格'],
        ]}
      />
    </Figure>
    <Code>{`「根據 data/costs.csv 建立一份 6 頁的季報，要有封面、
  目錄頁、兩張圖表和建議事項一節。」
「在這一頁，把第二段改成表格。」
「套用我的註解，然後跑 check 並給我看 diff。」`}</Code>
    <p style={p}>
      支援 MCP 的 agent 可以直接操作工作區：安裝 <code>@open-document/mcp</code> 後執行{' '}
      <code>open-doc dev --mcp</code>，連線到 <code>/mcp</code>
      。工具涵蓋文件（列出、讀取、建立、寫入、重新命名、複製、刪除）、文字與註解、主題、素材、資料夾，以及輸出（
      <code>check_layout</code>、<code>render_page</code>、<code>export_document</code>、
      <code>diff_document</code>、<code>import_markdown</code>）。
    </p>

    <h1 style={h1}>22. 快捷鍵</h1>
    <Figure id="t-shortcuts" kind="table" caption="檢視器的快捷鍵">
      <Table
        columns={['按鍵', '位置', '動作']}
        rows={[
          [<Kbd key="k">F</Kbd>, '檢視器', '開關全螢幕'],
          [<Kbd key="k">D</Kbd>, '檢視器（開發模式）', '設計面板'],
          [<Kbd key="k">Enter</Kbd>, '頁碼或縮放欄位', '套用輸入的數字'],
          [<Kbd key="k">Esc</Kbd>, '欄位、選單、搜尋', '取消或關閉'],
          [<Kbd key="k">⌘B / ⌘I / ⌘E</Kbd>, '編輯文字', '粗體／斜體／程式碼'],
          [<Kbd key="k">⌘K / ⌘\</Kbd>, '編輯文字', '連結／清除格式'],
          [<Kbd key="k">Shift+Enter</Kbd>, '編輯文字', '換行'],
          [<Kbd key="k">⌘S</Kbd>, 'Edit 模式', '儲存暫存的修改'],
          [<Kbd key="k">⌘Z / ⇧⌘Z</Kbd>, 'Edit 模式、設計面板', '復原／重做'],
        ]}
      />
    </Figure>

    <h1 style={h1}>23. 疑難排解</h1>
    <ul style={list}>
      <li>
        <strong>內容超出頁面。</strong>執行 <code>open-doc check</code>
        ，它會指出元素與原始碼行號。固定頁的話，把內容移到下一頁或改用 <code>flow()</code>。
      </li>
      <li>
        <strong>表格前面有一大段空白。</strong>
        區塊不會被切開，太高的表格會整個移到下一頁；請拆成兩個區塊。
      </li>
      <li>
        <strong>匯出時說缺少 Playwright。</strong>依第 17 節安裝；下載選單不需要它。
      </li>
      <li>
        <strong>修改存不了。</strong>由變數或資料檔產生的文字不能在頁面上編輯，元素面板會說明來源。
      </li>
      <li>
        <strong>Word 裡的字型不一樣。</strong>Word 使用讀者電腦上安裝的字型；請在{' '}
        <code>design.fonts</code> 設定中文字型與備用字型。
      </li>
    </ul>
    <Tip>
      十分鐘導覽：在頁碼欄輸入 4、縮放欄輸入 150 · 切到格狀版面再切回來 · 搜尋「註腳」 · 切到
      Edit，改一個標題，按 ⌘S 儲存 · 按 D 改強調色 · 在段落上給 agent 留一則註解 · 把這份手冊下載成
      Word · 執行 <code>open-doc diff getting-started-zh</code>。
    </Tip>
  </>,
  { header: Header, footer: Footer },
);

export default [Cover, Contents, Lists, Body] satisfies DocEntry[];
