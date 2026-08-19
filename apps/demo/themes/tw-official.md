---
name: 台灣公文（函）
description: 中華民國政府機關橫式「函」的版面：標楷體、三段式（主旨／說明／辦法）、檔號欄、發文資訊、正副本與署名。
pageSize: A4
mode: light
---

# 台灣公文（函）

## When to use

政府機關對外行文的「函」，以及格式相同的「書函」「開會通知單」等。也適用於需要比照公文格式撰寫的公家單位內部簽陳。

不要用在對外簡報、成果報告或任何需要視覺設計的文件——這個 theme 刻意毫無裝飾，因為公文的可信度來自格式一致，不是版面設計。

> **格式數值以本機關的《文書處理手冊》為準。** 下列邊界、字級是常見設定，各機關與各版本手冊略有出入；套用前請與貴機關的公文範本核對。

## Palette

| Role   | Value     | Notes                       |
| ------ | --------- | --------------------------- |
| bg     | `#ffffff` | 白紙                        |
| text   | `#000000` | 內文全黑，公文為黑白列印    |
| muted  | `#444444` | 聯絡資訊等次要文字          |
| accent | `#000000` | 公文不使用彩色強調          |
| rule   | `#000000` | 檔號欄、分隔線一律黑色實線  |

公文沒有「品牌色」。任何彩色都會讓文件看起來不像正式公文。

## Typography

- 全文使用**標楷體**。CSS stack：`'"DFKai-SB", "BiauKai", "標楷體", "TW-Kai", "Kaiti TC", serif'`
  - Windows 為 DFKai-SB、macOS 為 BiauKai；**全字庫正楷體**（TW-Kai，國發會全字庫免費授權）字距最接近公文範本，
    且涵蓋公文常見的罕用字與異體字，機關內部統一安裝這套最保險。
- 機關名稱＋文別：約 20pt（27 px）
- 本文（主旨／說明／辦法、受文者、正副本、署名）：約 16pt（21 px）
- 檔號欄、聯絡資訊、頁碼：約 12pt（16 px）
- 行高 1.5，不加字距調整。

## Page setup

- A4 直式，由左至右橫書。
- 四邊邊界 2.5 公分（94 px）。
- 頁碼置中於下緣：`第 N 頁，共 M 頁`。
- 檔號／保存年限欄置於首頁右上角，外框黑色實線。
- 首頁才有機關名稱、文別與聯絡資訊；續頁只有本文與頁碼。

## Design const

```tsx
export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#000000',
    muted: '#444444',
    accent: '#000000',
    rule: '#000000',
  },
  fonts: {
    heading: '"DFKai-SB", "BiauKai", "標楷體", "TW-Kai", "Kaiti TC", serif',
    body: '"DFKai-SB", "BiauKai", "標楷體", "TW-Kai", "Kaiti TC", serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  typeScale: { title: 27, h1: 21, h2: 21, h3: 21, body: 21, caption: 16 },
  margin: 94,
  leading: 1.5,
  radius: 0,
};
```

`radius: 0` 是刻意的——公文沒有圓角。

## Fixed components

### 檔號欄（首頁右上）

```tsx
const ArchiveBox = ({ code = '', keep = '' }: { code?: string; keep?: string }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
    <table
      style={{
        borderCollapse: 'collapse',
        fontSize: 'var(--od-size-caption)',
        lineHeight: 1.6,
      }}
    >
      <tbody>
        <tr>
          <td style={{ border: '1px solid var(--od-rule)', padding: '2px 8px' }}>檔　　號</td>
          <td style={{ border: '1px solid var(--od-rule)', padding: '2px 8px', minWidth: 150 }}>
            {code}
          </td>
        </tr>
        <tr>
          <td style={{ border: '1px solid var(--od-rule)', padding: '2px 8px' }}>保存年限</td>
          <td style={{ border: '1px solid var(--od-rule)', padding: '2px 8px' }}>{keep}</td>
        </tr>
      </tbody>
    </table>
  </div>
);
```

### 機關名稱與文別

```tsx
const Letterhead = ({ agency, kind = '函' }: { agency: string; kind?: string }) => (
  <h1
    style={{
      fontFamily: 'var(--od-font-heading)',
      fontSize: 'var(--od-size-title)',
      fontWeight: 400,
      textAlign: 'center',
      letterSpacing: '0.5em',
      textIndent: '0.5em',
      margin: '0 0 16px',
    }}
  >
    {agency} {kind}
  </h1>
);
```

字距拉開是公文標題的慣例；`textIndent` 補回末字多出的字距，讓標題真正置中。

### 聯絡資訊（首頁，靠右）

```tsx
const Contact = ({ lines }: { lines: string[] }) => (
  <div
    style={{
      fontSize: 'var(--od-size-caption)',
      lineHeight: 1.7,
      textAlign: 'left',
      marginLeft: 'auto',
      width: 'fit-content',
      marginBottom: 14,
    }}
  >
    {lines.map((line) => (
      <div key={line}>{line}</div>
    ))}
  </div>
);
```

### 發文資訊

```tsx
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
    <span style={{ flex: 'none' }}>{label}：</span>
    <span>{children}</span>
  </div>
);
```

依序為：受文者、發文日期、發文字號、速別、密等及解密條件或保密期限、附件。

### 三段式段落（主旨／說明／辦法）

段名後接內容，續行對齊內容而非段名——這個懸掛縮排是公文最容易做錯的地方。

```tsx
const Section = ({ name, children }: { name: string; children: ReactNode }) => (
  <div style={{ display: 'flex', marginTop: 18 }}>
    <span style={{ flex: 'none' }}>{name}：</span>
    <div style={{ flex: 1 }}>{children}</div>
  </div>
);
```

### 條列項目

```tsx
const Item = ({ no, children }: { no: string; children: ReactNode }) => (
  <div style={{ display: 'flex', marginBottom: 2 }}>
    <span style={{ flex: 'none', minWidth: '2.6em' }}>{no}</span>
    <span style={{ flex: 1 }}>{children}</span>
  </div>
);
```

層級用語：`一、二、三、` →　`(一)(二)` →　`1.2.` →　`(1)(2)`。

### 正本／副本與署名

```tsx
const Distribution = ({ to, cc }: { to: string; cc?: string }) => (
  <div style={{ marginTop: 22 }}>
    <div>正本：{to}</div>
    {cc && <div>副本：{cc}</div>}
  </div>
);

const Signature = ({ title, name }: { title: string; name: string }) => (
  <div style={{ marginTop: 28, textAlign: 'center', letterSpacing: '0.2em' }}>
    {title}　{name}
  </div>
);
```

### 頁碼

```tsx
const Footer = () => {
  const n = useDocPageNumber();
  const total = useDocPageCount();
  return (
    <div
      style={{
        position: 'absolute',
        left: 'var(--od-margin)',
        right: 'var(--od-margin)',
        bottom: 44,
        textAlign: 'center',
        fontSize: 'var(--od-size-caption)',
      }}
    >
      第 {n} 頁，共 {total} 頁
    </div>
  );
};
```

## 公文用語

**版面對了、文字不對，公文一樣會被退。** 這一節比上面的版面規範更常出錯，而且是 AI 代擬公文最容易失手的地方——模型會寫出「格式正確但讀起來不像公文」的句子。

### 主旨

- **一句話、一件事**，以 50 字為度。超過就把細節移到說明。
- 結構固定為 `動詞 ＋ 事項 ＋ 期望語`，例：「檢送本府○○要點修正草案 1 份，請查照。」
- **期望語只用一個。**「請查照並依說明事項辦理」是疊用，擇一即可。
- 不分項、不換行、結尾用句號。
- 背景、緣由、原因一律移到說明，不寫進主旨。

```
❌ 邇來本府偶有獎狀、聘書、感謝狀、證書等文書出現格式錯誤之情形，
   檢附用印格式供各局處參考，請查照並轉知所屬。      ← 緣由塞進主旨、期望語疊用
✅ 檢送本府常用文書用印格式 1 份，請查照並轉知所屬。   ← 一句話講完，緣由留給說明
```

### 說明

- 第一項慣例是**依據**，交代法令、來文或會議決議：「依據本府 115 年 7 月 20 日○字第 1150000000 號函辦理。」
- 沒有依據可寫時，第一項直接敘明事實或緣由。
- 主旨提過的事項，說明裡用**指代語**帶過，不要重複全稱：

  | 指代語     | 指涉對象                               |
  | ---------- | -------------------------------------- |
  | 旨揭、旨開 | 主旨提到的人事物（旨揭文書、旨開要點） |
  | 上開、前開 | 前面已敘明的項目                       |
  | 該         | 最近提到的對象（該局、該案）           |
  | 本案       | 本件公文所辦事項                       |

  一份文裡把「獎狀、聘書、感謝狀、證書」寫滿四次，是承辦人最常被退的毛病。

### 附件

- 附件欄寫**指向本文的位置**，不是列檔名：`附件：如說明二`。
- 本文提到時寫「（如附件）」「詳如附件一」。
- 附件欄列出的東西，本文一定要有對應敘述；**本文沒提到的附件不要出現在附件欄**。

### 慣用語彙

| 類別       | 用語                                       |
| ---------- | ------------------------------------------ |
| 期望語（對下級） | 請查照、請照辦、請辦理見復、請轉知所屬 |
| 期望語（對上級） | 請鑒核、請核示、請鑒察                 |
| 期望語（平行）   | 請查照、請惠允、請查照見復             |
| 准駁語     | 應予照准、未便照准、礙難照辦               |
| 引敘語     | 依據、奉、准、有關、關於                   |
| 結束語     | 復如說明、如說明二、無                     |

### 常見錯誤

| 錯誤             | 應改為                                                     |
| ---------------- | ---------------------------------------------------------- |
| 是類             | 非公文用語。寫「該類」「這類」，或直接省略                 |
| 主旨分項或換行   | 主旨必須一段寫完                                           |
| 期望語疊用       | 「請查照並依說明事項辦理」→ 擇一                           |
| 重複全稱         | 第二次提到就改用旨揭／該／上開                             |
| 辦法段重述說明   | 說明交代過的不要再寫一次；沒有新指示就**不要有辦法段**     |
| 口語與贅字       | 「進行檢討」→「檢討」；「做一個說明」→「說明」             |

> **AI 代擬的公文一定要由承辦人依本機關慣例覆核後才發文。** 各機關的用語習慣、期望語搭配、分項慣例都有差異，這一節寫的是通則，不是任何一個機關的定本。

## Rules

- **三段式的取捨**：只有「主旨」是必要的，且必須一段寫完、不分項；「說明」與「辦法」視需要才用。沒有內容就不要放空段名。
- 主旨結尾用句號，並以「請查照」「請鑒核」「復如說明」等結語收束。
- 日期一律用**中華民國紀年**（例：中華民國115年8月16日）。
- 「速別」填 最速件／速件／普通件；「密等」填 絕對機密／極機密／機密／密／普通。
- 全文不使用粗體、斜體、底線或彩色來強調——需要強調時改寫句子。
- 續頁不重複機關名稱與文別，只延續本文。
- 附件在「附件：」欄註明，本文中提到時寫「如附件」。
