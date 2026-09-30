import {
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
import workflow from './workflow.mmd';

export const meta: DocMeta = {
  title: 'Google Antigravity 導覽',
  subtitle: '以 agent 為中心的開發平台',
  author: '平台工程部',
  createdAt: '2026-09-30T00:00:00.000Z',
  labels: { figure: '圖', table: '表' },
};

export const design: DesignSystem = {
  palette: { bg: '#ffffff', text: '#1c1b22', muted: '#5f5b6b', accent: '#6d28d9', rule: '#e6e3ee' },
  fonts: {
    heading: '"Noto Sans TC", "Helvetica Neue", sans-serif',
    body: '"Noto Sans TC", "Helvetica Neue", sans-serif',
    mono: 'Menlo, "JetBrains Mono", ui-monospace, monospace',
  },
  typeScale: { title: 44, h1: 24, h2: 18, h3: 15, body: 12.5, caption: 10 },
  margin: 72,
  leading: 1.65,
  radius: 6,
};

const VIOLET = '#6d28d9';
const INDIGO = '#312e81';
const TEAL = '#0f766e';
const AMBER = '#b45309';

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

const h1: CSSProperties = {
  fontSize: 'var(--od-size-h1)',
  fontWeight: 700,
  lineHeight: 1.3,
  margin: '8px 0 12px',
};
const h2: CSSProperties = {
  fontSize: 'var(--od-size-h2)',
  fontWeight: 700,
  lineHeight: 1.35,
  margin: '18px 0 8px',
};
const p: CSSProperties = { margin: '0 0 10px' };
const list: CSSProperties = { margin: '0 0 10px', paddingLeft: 22, listStyle: 'disc' };
const cell: CSSProperties = {
  borderBottom: '1px solid var(--od-rule)',
  padding: '6px 8px',
  fontSize: 11,
  verticalAlign: 'top',
  textAlign: 'left',
};
const headCell: CSSProperties = {
  ...cell,
  background: '#ede9fe',
  color: '#4c1d95',
  fontWeight: 700,
  borderBottom: `2px solid ${VIOLET}`,
};

const C = ({ children }: { children: ReactNode }) => (
  <code
    style={{
      fontFamily: 'var(--od-font-mono)',
      fontSize: '0.9em',
      background: '#f3f0fa',
      padding: '1px 4px',
      borderRadius: 3,
    }}
  >
    {children}
  </code>
);

const Note = ({ title, children }: { title: string; children: ReactNode }) => (
  <blockquote
    style={{
      margin: '4px 0 14px',
      padding: '10px 14px',
      background: '#f5f3ff',
      borderLeft: `4px solid ${VIOLET}`,
      borderRadius: 4,
      fontSize: 11.5,
    }}
  >
    <strong style={{ color: '#4c1d95' }}>{title}</strong> {children}
  </blockquote>
);

const Warn = ({ children }: { children: ReactNode }) => (
  <blockquote
    style={{
      margin: '4px 0 14px',
      padding: '10px 14px',
      background: '#fffbeb',
      borderLeft: `4px solid ${AMBER}`,
      borderRadius: 4,
      fontSize: 11.5,
    }}
  >
    <strong style={{ color: AMBER }}>注意：</strong> {children}
  </blockquote>
);

/** A planet with the agent's three surfaces in orbit. */
const CoverArt = () => (
  <svg viewBox="0 0 520 320" width="520" height="320" role="img" aria-label="orbit">
    <rect x="0" y="0" width="520" height="320" rx="16" fill="#1e1b4b" />
    {[
      [40, 40],
      [120, 280],
      [470, 60],
      [430, 290],
      [300, 30],
      [80, 170],
      [490, 180],
      [210, 300],
    ].map(([x, y]) => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill="#e0e7ff" />
    ))}
    <ellipse
      cx="260"
      cy="165"
      rx="210"
      ry="62"
      fill="none"
      stroke="#c4b5fd"
      strokeWidth="1.5"
      strokeDasharray="6 6"
    />
    <circle cx="260" cy="165" r="78" fill={VIOLET} />
    <circle cx="238" cy="140" r="36" fill="#8b5cf6" opacity="0.6" />
    <ellipse cx="260" cy="165" rx="120" ry="22" fill="none" stroke="#ddd6fe" strokeWidth="3" />
    {[
      [70, 180, 'Editor', '#22d3ee'],
      [250, 232, 'Terminal', '#34d399'],
      [440, 140, 'Browser', '#fbbf24'],
    ].map(([x, y, label, color]) => (
      <g key={String(label)}>
        <rect
          x={Number(x) - 44}
          y={Number(y) - 16}
          width="88"
          height="32"
          rx="16"
          fill="#1e1b4b"
          stroke={String(color)}
          strokeWidth="2"
        />
        <text
          x={Number(x)}
          y={Number(y) + 5}
          textAnchor="middle"
          fontSize="13"
          fill="#fff"
          fontFamily="Helvetica Neue, Arial, sans-serif"
        >
          {label}
        </text>
      </g>
    ))}
  </svg>
);

/** The three surfaces an agent works across, as three small windows. */
const SurfacesArt = () => {
  const windows: Array<[string, string, ReactNode]> = [
    [
      '編輯器',
      '#0891b2',
      <>
        {[70, 110, 90, 130, 60, 100].map((width, at) => (
          <rect
            key={`${width}-${at}`}
            x={14 + (at % 2) * 12}
            y={44 + at * 16}
            width={width}
            height="7"
            rx="3"
            fill={at === 3 ? '#a78bfa' : '#cbd5e1'}
          />
        ))}
      </>,
    ],
    [
      '終端機',
      '#059669',
      <>
        {['$ npm test', '✓ 42 passed', '$ npm run build', 'done in 3.1s'].map((line, at) => (
          <text
            key={line}
            x="14"
            y={56 + at * 22}
            fontSize="11"
            fill={at % 2 ? '#34d399' : '#e2e8f0'}
            fontFamily="Menlo, monospace"
          >
            {line}
          </text>
        ))}
      </>,
    ],
    [
      '瀏覽器',
      '#d97706',
      <>
        <rect x="14" y="42" width="152" height="14" rx="7" fill="#e2e8f0" />
        <rect x="14" y="66" width="70" height="60" rx="4" fill="#fde68a" />
        <rect x="92" y="66" width="74" height="26" rx="4" fill="#e2e8f0" />
        <rect x="92" y="100" width="74" height="26" rx="4" fill="#e2e8f0" />
        <circle cx="120" cy="140" r="8" fill="none" stroke="#d97706" strokeWidth="2" />
        <path d="M125 145 L136 156" stroke="#d97706" strokeWidth="2" />
      </>,
    ],
  ];
  return (
    <svg viewBox="0 0 600 200" width="600" height="200" role="img" aria-label="three surfaces">
      {windows.map(([label, color, body], at) => {
        const x = at * 205;
        const dark = label === '終端機';
        return (
          <g key={label} transform={`translate(${x}, 10)`}>
            <rect
              width="180"
              height="176"
              rx="10"
              fill={dark ? '#0f172a' : '#ffffff'}
              stroke={color}
              strokeWidth="2"
            />
            <rect width="180" height="28" rx="10" fill={color} />
            <rect y="18" width="180" height="10" fill={color} />
            {[14, 28, 42].map((cx) => (
              <circle key={cx} cx={cx} cy="14" r="4" fill="#ffffff" opacity="0.8" />
            ))}
            <text
              x="120"
              y="19"
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill="#fff"
              fontFamily="Noto Sans TC, sans-serif"
            >
              {label}
            </text>
            {body}
          </g>
        );
      })}
    </svg>
  );
};

/** A sketch of the Agent Manager: workspaces on the left, agents on the right. */
const ManagerArt = () => {
  const agents: Array<[string, string, string, number]> = [
    ['重構付款模組', '執行中', '#7c3aed', 0.6],
    ['修正登入頁 RWD', '等待審閱', AMBER, 1],
    ['補齊 API 測試', '已完成', TEAL, 1],
  ];
  return (
    <svg viewBox="0 0 600 230" width="600" height="230" role="img" aria-label="agent manager">
      <rect width="600" height="230" rx="12" fill="#faf9fd" stroke="#e6e3ee" />
      <rect width="150" height="230" rx="12" fill="#1e1b4b" />
      <rect x="138" width="12" height="230" fill="#1e1b4b" />
      <text
        x="18"
        y="30"
        fontSize="12"
        fontWeight="700"
        fill="#c4b5fd"
        fontFamily="Noto Sans TC, sans-serif"
      >
        Workspaces
      </text>
      {['shop-web', 'payment-api', 'mobile-app'].map((name, at) => (
        <g key={name}>
          <rect
            x="12"
            y={48 + at * 34}
            width="126"
            height="26"
            rx="6"
            fill={at === 0 ? '#4c1d95' : 'transparent'}
          />
          <text x="24" y={65 + at * 34} fontSize="11" fill="#e0e7ff" fontFamily="Menlo, monospace">
            {name}
          </text>
        </g>
      ))}
      <text
        x="172"
        y="30"
        fontSize="13"
        fontWeight="700"
        fill="#1c1b22"
        fontFamily="Noto Sans TC, sans-serif"
      >
        Agent Manager · 收件匣
      </text>
      {agents.map(([task, status, color, progress], at) => {
        const y = 48 + at * 58;
        return (
          <g key={task}>
            <rect x="172" y={y} width="408" height="48" rx="8" fill="#fff" stroke="#e6e3ee" />
            <circle cx="192" cy={y + 24} r="7" fill={color} />
            <text
              x="208"
              y={y + 21}
              fontSize="12.5"
              fontWeight="700"
              fill="#1c1b22"
              fontFamily="Noto Sans TC, sans-serif"
            >
              {task}
            </text>
            <rect x="208" y={y + 30} width="220" height="6" rx="3" fill="#ede9fe" />
            <rect x="208" y={y + 30} width={220 * progress} height="6" rx="3" fill={color} />
            <rect x="480" y={y + 13} width="84" height="22" rx="11" fill={color} opacity="0.12" />
            <text
              x="522"
              y={y + 28}
              textAnchor="middle"
              fontSize="11"
              fill={color}
              fontFamily="Noto Sans TC, sans-serif"
            >
              {status}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/** Where each setting sits between asking every time and running on its own. */
const Spectrum = () => (
  <div style={{ padding: '14px 12px 8px', border: '1px solid var(--od-rule)', borderRadius: 8 }}>
    <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden' }}>
      {['#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', VIOLET].map((color) => (
        <div key={color} style={{ flex: 1, background: color }} />
      ))}
    </div>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 10,
        color: 'var(--od-muted)',
        marginTop: 6,
      }}
    >
      <span>每一步都問我</span>
      <span>由 agent 判斷</span>
      <span>全自動</span>
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      {[
        ['終端機指令', 'Off', 'Auto', 'Turbo'],
        ['審閱 Artifacts', '一律請我審閱', 'Agent 決定', '直接繼續'],
      ].map(([label, ...levels]) => (
        <div key={label} style={{ flex: 1, background: '#faf9fd', borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, marginBottom: 4 }}>{label}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
            {levels.map((level) => (
              <span key={level}>{level}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const Cover: DocPage = () => (
  <div
    style={{ ...page, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
  >
    <p
      style={{
        margin: 0,
        fontSize: 11,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'var(--od-accent)',
        fontWeight: 700,
      }}
    >
      Agent-first IDE · 工具導覽
    </p>
    <CoverArt />
    <div>
      <h1
        data-od-outline="skip"
        style={{ ...h1, fontSize: 'var(--od-size-title)', margin: '0 0 10px', lineHeight: 1.15 }}
      >
        Google Antigravity 導覽
      </h1>
      <p style={{ ...p, fontSize: 16, color: 'var(--od-muted)' }}>
        從「寫程式的助手」到「交付任務的 agent」：一個以 agent 為中心的開發平台
      </p>
      <p style={{ ...p, fontSize: 11, color: 'var(--od-muted)', marginTop: 18 }}>
        平台工程部 · 2026 年 9 月
      </p>
    </div>
  </div>
);

const Contents: DocPage = () => (
  <div style={page}>
    <h2 data-od-outline="skip" style={h1}>
      目錄
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
    <span>Google Antigravity 導覽</span>
    <span>
      {useDocPageNumber()} / {useDocPageCount()}
    </span>
  </div>
);

const Body = flow(
  <>
    <h1 style={h1}>1. Antigravity 是什麼</h1>
    <p style={p}>
      <strong>Google Antigravity</strong> 是 Google 在 2025 年 11 月、與 Gemini 3 同時發表的開發平台
      <Footnote>
        官方網站：https://antigravity.google/ 。發表時以免費公開預覽提供，支援 macOS、Windows 與
        Linux。
      </Footnote>
      。它保留了熟悉的 IDE 編輯體驗，但把重心放在<em>agent</em>
      ：你交付的是一個任務，而不是一行一行的補全；agent
      自己規劃、改程式碼、跑指令、開瀏覽器驗證，再把成果交回來給你審閱。
    </p>
    <Note title="和傳統 AI 程式助手的差別：">
      助手是「你寫、它幫忙」；Antigravity
      是「你分派、它執行、你審閱」。人的角色從打字的人變成架構師與審閱者。
    </Note>
    <p style={p}>
      agent 能直接操作開發時的三個介面（
      <Ref to="f-surfaces" />
      ）。因為能開瀏覽器，它可以真的點開自己改好的頁面，確認按鈕能按、版面沒跑掉，而不是只相信測試通過。
    </p>
    <Figure id="f-surfaces" caption="agent 同時操作編輯器、終端機與瀏覽器">
      <SurfacesArt />
    </Figure>

    <h1 style={h1}>2. 兩種工作介面</h1>
    <p style={p}>
      Antigravity 把工作分成兩個視角，
      <Ref to="t-views" /> 比較兩者：
    </p>
    <Figure id="t-views" kind="table" caption="Editor 與 Manager 兩種視角">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headCell, width: 90 }} />
            <th style={headCell}>Editor 視角</th>
            <th style={headCell}>Manager 視角</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['長相', '熟悉的 IDE，側邊有 agent 面板', '任務控制台，列出所有 agent 與狀態'],
            ['適合', '親手寫程式、小範圍修改、補全', '同時派出多個 agent 處理不同任務'],
            ['互動方式', '同步：邊寫邊問', '非同步：派工後去做別的事，回來審閱'],
            ['範圍', '目前開啟的專案', '可跨多個 workspace'],
          ].map(([label, editor, manager]) => (
            <tr key={label}>
              <td style={{ ...cell, fontWeight: 700 }}>{label}</td>
              <td style={cell}>{editor}</td>
              <td style={cell}>{manager}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
    <p style={p}>
      Manager 視角（Agent Manager）像一個收件匣：每個任務是一列，顯示進度與是否在等你（
      <Ref to="f-manager" />
      ）。你可以同時讓一個 agent 重構後端、另一個修前端版面，第三個補測試。
    </p>
    <Figure id="f-manager" caption="Agent Manager 的示意畫面">
      <ManagerArt />
    </Figure>

    <h1 style={h1}>3. Artifacts：用成果建立信任</h1>
    <p style={p}>
      要放心讓 agent 自己做事，關鍵是看得到它做了什麼。Antigravity
      不要你讀一長串工具呼叫紀錄，而是讓 agent 產出人看得懂的 <strong>Artifacts</strong>：
    </p>
    <Figure id="t-artifacts" kind="table" caption="常見的 Artifact 類型">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headCell, width: 120 }}>Artifact</th>
            <th style={headCell}>內容</th>
            <th style={{ ...headCell, width: 120 }}>什麼時候看</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['任務清單', 'agent 拆解出的步驟與目前進度。', '開工前、進行中'],
            ['實作計畫', '打算改哪些檔案、怎麼改、為什麼。', '動手之前'],
            ['Walkthrough', '完成後的變更摘要與驗證方式。', '審閱時'],
            ['截圖', '頁面在瀏覽器裡的實際樣子。', '驗證 UI'],
            ['瀏覽器錄影', 'agent 操作頁面的過程。', '驗證互動流程'],
          ].map(([name, content, when]) => (
            <tr key={name}>
              <td style={{ ...cell, fontWeight: 700 }}>{name}</td>
              <td style={cell}>{content}</td>
              <td style={cell}>{when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
    <p style={p}>
      你可以直接在 Artifact 上留言，像在文件上加註解一樣，例如在實作計畫上寫「這裡改用既有的
      <C>useCart</C> hook」。agent 會把回饋納入後續工作，不必中斷它重新下指令。整個循環如{' '}
      <Ref to="f-workflow" />。
    </p>
    <Diagram chart={workflow} caption="從交付任務到完成的工作循環" id="f-workflow" width={420} />

    <h1 style={h1}>4. 控制 agent 的自主程度</h1>
    <p style={p}>
      自主程度可以依專案與信任程度調整
      <Footnote>設定名稱依預覽版介面整理，正式版可能調整。</Footnote>：
    </p>
    <ul style={list}>
      <li>
        <strong>Planning 模式</strong>：先產出計畫與任務清單再動手，適合複雜或有風險的任務。
      </li>
      <li>
        <strong>Fast 模式</strong>：直接執行，適合改文案、修小 bug 這類簡單任務。
      </li>
      <li>
        <strong>終端機執行政策</strong>：從每個指令都要確認，到讓 agent 自行判斷，再到全自動執行。
      </li>
      <li>
        <strong>審閱政策</strong>：決定 agent 產出 Artifact 後，要停下來等你，還是繼續往下做。
      </li>
    </ul>
    <Figure id="f-spectrum" caption="自主程度的光譜">
      <Spectrum />
    </Figure>
    <Warn>
      agent
      能執行終端機指令、存取檔案與瀏覽器。處理正式環境的憑證或資料庫時，請使用較保守的設定，並善用指令的允許清單與禁止清單。
    </Warn>

    <h1 style={h1}>5. 支援的模型</h1>
    <p style={p}>
      Antigravity 以 Gemini 3 Pro 為主力模型，發表時也支援 Anthropic 的 Claude Sonnet 4.5 與 OpenAI
      的開放權重模型 GPT-OSS
      <Footnote>可用模型與額度依時期與方案而異，請以產品內的模型選單為準。</Footnote>
      。不同任務可以選不同模型，例如規劃用推理較強的模型，重複性的修改用速度較快的模型。
    </p>

    <h1 style={h1}>6. 導入建議</h1>
    <h2 style={h2}>6.1 從小任務開始</h2>
    <p style={p}>
      先挑邊界清楚、容易驗證的任務：補測試、修 lint、調整 UI 細節。觀察 agent 產出的計畫與
      walkthrough，再逐步放寬自主程度。
    </p>
    <h2 style={h2}>6.2 把審閱當成主要工作</h2>
    <p style={p}>
      agent 寫得快，瓶頸會移到審閱。建議團隊約定：沒有 walkthrough
      與驗證截圖的變更不合併；計畫階段就對架構提出意見，比事後大改便宜得多。
    </p>
    <h2 style={h2}>6.3 與 ADK 的關係</h2>
    <p style={p}>
      Antigravity 是<em>開發者使用</em>的 agent 工具；ADK 則是<em>開發 agent</em>
      的框架。兩者可以一起用：在 Antigravity 裡讓 agent 幫你寫 ADK agent、跑 <C>adk eval</C>
      ，再用瀏覽器驗證 <C>adk web</C> 的對話結果。
    </p>
    <p style={{ ...p, fontSize: 10.5, color: 'var(--od-muted)', marginTop: 16 }}>
      本文依發表時的公開資料整理；Antigravity 仍在快速迭代，介面與功能名稱請以官方文件為準。
    </p>
  </>,
  { footer: Footer },
);

export default [Cover, Contents, Body] satisfies DocEntry[];
