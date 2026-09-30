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
import multiAgent from './multi-agent.mmd';
import runtime from './runtime.mmd';

export const meta: DocMeta = {
  title: 'Google ADK 入門指南',
  subtitle: '用 Agent Development Kit 打造多代理系統',
  author: '平台工程部',
  createdAt: '2026-09-30T00:00:00.000Z',
  labels: { figure: '圖', table: '表' },
};

export const design: DesignSystem = {
  palette: { bg: '#ffffff', text: '#1f2328', muted: '#5f6368', accent: '#1a73e8', rule: '#e3e6ea' },
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

const BLUE = '#1a73e8';
const GREEN = '#1e8e3e';
const YELLOW = '#f9ab00';
const RED = '#d93025';

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
  color: 'var(--od-text)',
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
  background: '#e8f0fe',
  color: '#174ea6',
  fontWeight: 700,
  borderBottom: `2px solid ${BLUE}`,
};

const C = ({ children }: { children: ReactNode }) => (
  <code
    style={{
      fontFamily: 'var(--od-font-mono)',
      fontSize: '0.9em',
      background: '#f1f3f4',
      padding: '1px 4px',
      borderRadius: 3,
    }}
  >
    {children}
  </code>
);

const Code = ({ children }: { children: string }) => (
  <pre
    style={{
      fontFamily: 'var(--od-font-mono)',
      fontSize: 10.5,
      lineHeight: 1.55,
      background: '#f8f9fa',
      border: '1px solid var(--od-rule)',
      borderRadius: 'var(--od-radius)',
      padding: '12px 14px',
      margin: '0 0 12px',
      whiteSpace: 'pre-wrap',
    }}
  >
    {children}
  </pre>
);

const Tip = ({ title, children }: { title: string; children: ReactNode }) => (
  <blockquote
    style={{
      margin: '4px 0 14px',
      padding: '10px 14px',
      background: '#e8f0fe',
      borderLeft: `4px solid ${BLUE}`,
      borderRadius: 4,
      fontSize: 11.5,
    }}
  >
    <strong style={{ color: '#174ea6' }}>{title}</strong> {children}
  </blockquote>
);

/** A small network of agents: the cover's picture. */
const CoverArt = () => (
  <svg viewBox="0 0 520 300" width="520" height="300" role="img" aria-label="agent network">
    <rect x="0" y="0" width="520" height="300" fill="#f4f8fe" />
    {[
      [260, 150, 110, 60],
      [260, 150, 410, 60],
      [260, 150, 90, 230],
      [260, 150, 430, 230],
      [110, 60, 40, 130],
      [410, 60, 490, 140],
      [90, 230, 200, 280],
      [430, 230, 330, 285],
    ].map(([x1, y1, x2, y2]) => (
      <line
        key={`${x1}-${y1}-${x2}-${y2}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#aecbfa"
        strokeWidth="2"
      />
    ))}
    <rect x="195" y="120" width="130" height="60" rx="14" fill={BLUE} />
    <text
      x="260"
      y="157"
      textAnchor="middle"
      fontSize="17"
      fontWeight="700"
      fill="#fff"
      fontFamily="Helvetica Neue, Arial, sans-serif"
    >
      root_agent
    </text>
    {[
      [110, 60, GREEN, 'writer'],
      [410, 60, RED, 'reviewer'],
      [90, 230, YELLOW, 'search'],
      [430, 230, GREEN, 'support'],
    ].map(([x, y, color, label]) => (
      <g key={String(label)}>
        <rect
          x={Number(x) - 50}
          y={Number(y) - 20}
          width="100"
          height="40"
          rx="10"
          fill="#fff"
          stroke={String(color)}
          strokeWidth="3"
        />
        <text
          x={Number(x)}
          y={Number(y) + 6}
          textAnchor="middle"
          fontSize="14"
          fill="#1f2328"
          fontFamily="Menlo, monospace"
        >
          {label}
        </text>
      </g>
    ))}
    {[
      [40, 130, BLUE],
      [490, 140, YELLOW],
      [200, 280, RED],
      [330, 285, BLUE],
    ].map(([x, y, color]) => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r="10" fill={String(color)} />
    ))}
  </svg>
);

/** ADK as layers, from the app down to where it runs. */
const StackArt = () => {
  const rows: Array<[string, string[], string]> = [
    ['你的應用', ['Web UI', 'API', '聊天介面'], '#5f6368'],
    ['執行層', ['Runner', 'SessionService', 'MemoryService', 'ArtifactService'], BLUE],
    ['Agents', ['LlmAgent', 'SequentialAgent', 'ParallelAgent', 'LoopAgent', '自訂 Agent'], GREEN],
    ['Tools', ['Function', '內建工具', 'MCP', 'OpenAPI', 'AgentTool'], YELLOW],
    ['模型', ['Gemini', 'Vertex AI', '其他模型（LiteLLM）'], RED],
    ['部署', ['Agent Engine', 'Cloud Run', 'GKE', '自有環境'], '#5f6368'],
  ];
  return (
    <svg viewBox="0 0 620 330" width="620" height="330" role="img" aria-label="ADK layers">
      {rows.map(([label, items, color], row) => {
        const y = row * 54 + 4;
        const width = (500 - (items.length - 1) * 8) / items.length;
        return (
          <g key={label}>
            <rect x="0" y={y} width="104" height="46" rx="6" fill={color} />
            <text
              x="52"
              y={y + 28}
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              fill="#fff"
              fontFamily="Noto Sans TC, sans-serif"
            >
              {label}
            </text>
            {items.map((item, at) => (
              <g key={item}>
                <rect
                  x={116 + at * (width + 8)}
                  y={y}
                  width={width}
                  height="46"
                  rx="6"
                  fill="#fff"
                  stroke={color}
                  strokeWidth="1.5"
                />
                <text
                  x={116 + at * (width + 8) + width / 2}
                  y={y + 28}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#1f2328"
                  fontFamily="Noto Sans TC, sans-serif"
                >
                  {item}
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
};

const Cover: DocPage = () => (
  <div
    style={{
      ...page,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}
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
      Agent Development Kit · 技術導讀
    </p>
    <CoverArt />
    <div>
      <h1
        data-od-outline="skip"
        style={{ ...h1, fontSize: 'var(--od-size-title)', margin: '0 0 10px', lineHeight: 1.15 }}
      >
        Google ADK 入門指南
      </h1>
      <p style={{ ...p, fontSize: 16, color: 'var(--od-muted)' }}>
        用 Agent Development Kit 打造可測試、可部署的多代理系統
      </p>
      <div style={{ display: 'flex', gap: 6, margin: '18px 0 10px' }}>
        {[BLUE, RED, YELLOW, GREEN].map((color) => (
          <div key={color} style={{ width: 36, height: 5, background: color, borderRadius: 3 }} />
        ))}
      </div>
      <p style={{ ...p, fontSize: 11, color: 'var(--od-muted)' }}>平台工程部 · 2026 年 9 月</p>
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
    <span>Google ADK 入門指南</span>
    <span>
      {useDocPageNumber()} / {useDocPageCount()}
    </span>
  </div>
);

const Body = flow(
  <>
    <h1 style={h1}>1. ADK 是什麼</h1>
    <p style={p}>
      <strong>Agent Development Kit（ADK）</strong>是 Google 開源的代理（agent）開發框架，2025 年 4
      月於 Google Cloud NEXT 發表
      <Footnote>
        官方文件：https://google.github.io/adk-docs/ ；原始碼：https://github.com/google/adk-python
        。
      </Footnote>
      。它把「寫一個
      agent」變成和寫一般軟體一樣的事：用程式碼定義行為、用單元測試與評估集驗證、再部署到任何能跑容器的地方。
    </p>
    <p style={p}>
      ADK 針對 Gemini 與 Google Cloud 最佳化，但本身<em>與模型無關</em>、與部署環境無關：透過
      LiteLLM 等整合也能接上其他模型，打包後可以跑在本機、Cloud Run、GKE 或 Vertex AI Agent Engine。
    </p>
    <Tip title="一句話總結：">
      ADK 讓 agent 從「一段提示詞」變成「一個有結構、可測試、可組合的軟體元件」。
    </Tip>
    <p style={p}>
      <Ref to="f-stack" /> 是 ADK 的分層示意：應用程式只和 Runner 對話；Runner 負責驅動 agent、保存
      session；agent 再去呼叫模型與工具。
    </p>
    <Figure id="f-stack" caption="ADK 的分層架構">
      <StackArt />
    </Figure>

    <h1 style={h1}>2. 核心概念</h1>
    <p style={p}>
      ADK 的 API 圍繞幾個名詞展開，先把它們弄清楚，後面的程式碼就很好讀。
      <Ref to="t-concepts" />
      整理了每個概念的角色。
    </p>
    <Figure id="t-concepts" kind="table" caption="ADK 的核心概念">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headCell, width: 110 }}>概念</th>
            <th style={headCell}>負責什麼</th>
            <th style={{ ...headCell, width: 150 }}>常見類別</th>
          </tr>
        </thead>
        <tbody>
          {[
            [
              'Agent',
              '決定下一步要做什麼：回答、呼叫工具，或把任務轉派給其他 agent。',
              'LlmAgent、SequentialAgent',
            ],
            [
              'Tool',
              'agent 能執行的動作，例如查資料庫、呼叫 API、搜尋網路。',
              'FunctionTool、MCPToolset',
            ],
            [
              'Runner',
              '執行引擎：接收使用者訊息、驅動 agent、把事件寫回 session。',
              'Runner、InMemoryRunner',
            ],
            [
              'Session / State',
              '一段對話的歷史與暫存狀態，agent 之間可透過 state 傳值。',
              'SessionService',
            ],
            ['Memory', '跨 session 的長期記憶，可被搜尋後帶入上下文。', 'MemoryService'],
            ['Artifact', '對話中產生或上傳的檔案，例如圖片、PDF。', 'ArtifactService'],
            [
              'Callback',
              '在模型或工具呼叫前後插入自訂邏輯，做防護或紀錄。',
              'before_model_callback',
            ],
            ['Event', '每一步的紀錄：訊息、工具呼叫、狀態變更，全部都是事件。', 'Event'],
          ].map(([name, role, classes]) => (
            <tr key={name}>
              <td style={{ ...cell, fontWeight: 700 }}>{name}</td>
              <td style={cell}>{role}</td>
              <td style={{ ...cell, fontFamily: 'var(--od-font-mono)', fontSize: 10 }}>
                {classes}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
    <p style={p}>
      一次對話的執行流程如 <Ref to="f-runtime" />
      ：Runner 把訊息交給 agent，agent 帶著上下文呼叫模型；模型若要求呼叫工具，ADK
      執行工具後把結果送回模型，直到產生最終回應。每一步都會成為一個 Event，存進 Session。
    </p>
    <Diagram chart={runtime} caption="一次請求在 ADK 中的執行流程" id="f-runtime" width={600} />

    <h1 style={h1}>3. 三種 Agent</h1>
    <h2 style={h2}>3.1 LLM Agent</h2>
    <p style={p}>
      最常用的 <C>LlmAgent</C>（別名 <C>Agent</C>
      ）由模型推理決定下一步。你給它名稱、模型、指令與工具，其餘交給模型判斷。
    </p>
    <h2 style={h2}>3.2 Workflow Agent</h2>
    <p style={p}>
      當流程是固定的，就不需要讓模型決定順序。ADK 提供三種不靠模型、行為可預測的流程 agent：
    </p>
    <ul style={list}>
      <li>
        <C>SequentialAgent</C>：依序執行子 agent，像一條產線。
      </li>
      <li>
        <C>ParallelAgent</C>：同時執行多個子 agent，適合彼此獨立的查詢。
      </li>
      <li>
        <C>LoopAgent</C>：重複執行直到條件成立或達到次數上限，適合「寫—審—改」的迭代。
      </li>
    </ul>
    <h2 style={h2}>3.3 Custom Agent</h2>
    <p style={p}>
      繼承 <C>BaseAgent</C> 並實作 <C>_run_async_impl</C>
      ，就能寫出任意的控制流程，例如依條件分支、呼叫外部系統後再決定轉派對象。
    </p>
    <p style={p}>
      三種 agent 可以自由組合成階層：
      <Ref to="f-multi" /> 的協調者會把客服問題轉派給客服
      agent，把寫作任務交給「撰寫→審閱」的流程，並把搜尋 agent 當成工具使用。
    </p>
    <Diagram chart={multiAgent} caption="多代理的階層組合" id="f-multi" width={520} />

    <h1 style={h1}>4. 工具</h1>
    <p style={p}>
      工具決定了 agent 能「做」什麼。ADK 支援多種來源的工具，彼此可以混用在同一個 agent 上：
    </p>
    <Figure id="t-tools" kind="table" caption="ADK 支援的工具類型">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headCell, width: 120 }}>類型</th>
            <th style={headCell}>說明</th>
            <th style={{ ...headCell, width: 120 }}>適合情境</th>
          </tr>
        </thead>
        <tbody>
          {[
            [
              'Function Tool',
              '任何 Python 函式；ADK 從型別註記與 docstring 產生工具描述。',
              '內部 API、商業邏輯',
            ],
            ['內建工具', '例如 Google 搜尋、程式碼執行。', '即時資訊、計算'],
            [
              'MCP Toolset',
              '連接任何 Model Context Protocol 伺服器，直接取用它的工具。',
              '既有的 MCP 生態',
            ],
            ['OpenAPI Toolset', '由 OpenAPI 規格自動產生工具。', '已有 REST API'],
            ['AgentTool', '把另一個 agent 包成工具呼叫，呼叫完控制權會回來。', '專家子任務'],
          ].map(([kind, detail, when]) => (
            <tr key={kind}>
              <td style={{ ...cell, fontWeight: 700 }}>{kind}</td>
              <td style={cell}>{detail}</td>
              <td style={cell}>{when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
    <Tip title="轉派 vs. AgentTool：">
      用 <C>sub_agents</C> 轉派時，對話的主導權交給子 agent；用 <C>AgentTool</C>
      時，子 agent 只回傳結果，主導權仍在原本的 agent。
    </Tip>

    <h1 style={h1}>5. 快速上手</h1>
    <h2 style={h2}>5.1 安裝與專案結構</h2>
    <Code>{`uv init weather-agent && cd weather-agent
uv add google-adk
# 專案結構
weather_agent/
  __init__.py      # from . import agent
  agent.py         # 定義 root_agent
  .env             # GOOGLE_API_KEY=...`}</Code>
    <h2 style={h2}>5.2 第一個 Agent</h2>
    <p style={p}>
      一個函式就是一個工具。ADK 會讀取函式的型別與 docstring，告訴模型這個工具能做什麼。
    </p>
    <Code>{`from google.adk.agents import Agent

def get_weather(city: str) -> dict:
    """回傳指定城市目前的天氣。"""
    return {"status": "success", "report": f"{city} 晴，攝氏 26 度"}

root_agent = Agent(
    name="weather_agent",
    model="gemini-2.5-flash",
    description="回答天氣問題的助理",
    instruction="你是親切的天氣助理，需要天氣資料時呼叫 get_weather。",
    tools=[get_weather],
)`}</Code>
    <h2 style={h2}>5.3 串成流程</h2>
    <p style={p}>
      <C>output_key</C> 會把 agent 的輸出存進 session state，下一個 agent 的指令用{' '}
      <C>{'{draft}'}</C>
      就能讀到它。
    </p>
    <Code>{`from google.adk.agents import LlmAgent, SequentialAgent

writer = LlmAgent(
    name="writer", model="gemini-2.5-flash",
    instruction="依使用者給的主題寫一段 200 字草稿。",
    output_key="draft",
)
reviewer = LlmAgent(
    name="reviewer", model="gemini-2.5-flash",
    instruction="審閱這份草稿並提出三點修改建議：{draft}",
)
root_agent = SequentialAgent(name="pipeline", sub_agents=[writer, reviewer])`}</Code>
    <h2 style={h2}>5.4 開發工具</h2>
    <Figure id="t-cli" kind="table" caption="ADK 命令列工具">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headCell, width: 150 }}>指令</th>
            <th style={headCell}>用途</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['adk web', '啟動瀏覽器開發介面，可對話、檢視每個事件與 state、追蹤工具呼叫。'],
            ['adk run <agent>', '在終端機直接與 agent 對話。'],
            ['adk api_server', '以 FastAPI 啟動本機 HTTP 服務，方便整合測試。'],
            ['adk eval', '用評估集（.evalset.json）檢查回應與工具呼叫軌跡。'],
            ['adk deploy', '部署到 Cloud Run 或 Vertex AI Agent Engine。'],
          ].map(([command, use]) => (
            <tr key={command}>
              <td style={{ ...cell, fontFamily: 'var(--od-font-mono)', fontSize: 10.5 }}>
                {command}
              </td>
              <td style={cell}>{use}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>

    <h1 style={h1}>6. 評估與部署</h1>
    <p style={p}>
      agent 的輸出不固定，所以 ADK 的評估同時看兩件事：<strong>最終回應</strong>是否符合預期，以及
      <strong>工具呼叫的軌跡</strong>是否合理——例如該查天氣時有沒有真的呼叫 <C>get_weather</C>
      。評估集可以放進 CI，每次改提示詞都跑一次，避免「改好一個、壞掉三個」。
    </p>
    <p style={p}>部署時常見的三個選項：</p>
    <ul style={list}>
      <li>
        <strong>Vertex AI Agent Engine</strong>：全代管，內建 session 與記憶服務，最省維運。
      </li>
      <li>
        <strong>Cloud Run</strong>：容器化、按用量計費，適合既有的 Cloud Run 團隊。
      </li>
      <li>
        <strong>GKE 或自有環境</strong>：需要完全掌控網路與資源時使用。
      </li>
    </ul>
    <p style={p}>
      跨框架、跨團隊的 agent 之間則可以透過 <strong>A2A（Agent2Agent）協定</strong>溝通
      <Footnote>
        A2A 是 Google 發起、之後捐給 Linux Foundation 的開放協定，讓不同框架的 agent
        互相發現與委派任務。
      </Footnote>
      ，ADK agent 能以 A2A 對外提供服務，也能呼叫遠端的 A2A agent。
    </p>

    <h1 style={h1}>7. 何時選擇 ADK</h1>
    <Figure id="t-fit" kind="table" caption="ADK 的適用情境">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th
              style={{ ...headCell, background: '#e6f4ea', color: GREEN, borderBottomColor: GREEN }}
            >
              適合
            </th>
            <th style={{ ...headCell, background: '#fce8e6', color: RED, borderBottomColor: RED }}>
              可能不需要
            </th>
          </tr>
        </thead>
        <tbody>
          {[
            ['需要多個 agent 分工合作', '只是單次呼叫模型、沒有工具'],
            ['要把 agent 當軟體測試與版本控管', '純粹實驗提示詞的一次性腳本'],
            [
              '部署在 Google Cloud，或需要 Gemini 的原生能力',
              '已深度綁定其他 agent 框架的既有系統',
            ],
            ['需要 MCP、OpenAPI 等既有工具生態', '只需要簡單的 RAG 問答'],
          ].map(([yes, no]) => (
            <tr key={yes}>
              <td style={cell}>✓ {yes}</td>
              <td style={cell}>– {no}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
    <p style={{ ...p, fontSize: 10.5, color: 'var(--od-muted)' }}>
      本文依撰寫時的公開資料整理，ADK 仍在快速演進，類別名稱與指令請以官方文件為準
      <Footnote>各語言版本（Python、Java、Go 等）的功能進度不完全相同。</Footnote>。
    </p>
  </>,
  { footer: Footer },
);

export default [Cover, Contents, Body] satisfies DocEntry[];
