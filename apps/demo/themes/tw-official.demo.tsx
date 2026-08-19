import {
  type DesignSystem,
  type DocPage,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
import type { CSSProperties, ReactNode } from 'react';

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

const ArchiveBox = ({ code = '', keep = '' }: { code?: string; keep?: string }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
    <table
      style={{ borderCollapse: 'collapse', fontSize: 'var(--od-size-caption)', lineHeight: 1.6 }}
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

const Contact = ({ lines }: { lines: string[] }) => (
  <div
    style={{
      fontSize: 'var(--od-size-caption)',
      lineHeight: 1.7,
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

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
    <span style={{ flex: 'none' }}>{label}：</span>
    <span>{children}</span>
  </div>
);

const Section = ({ name, children }: { name: string; children: ReactNode }) => (
  <div style={{ display: 'flex', marginTop: 18 }}>
    <span style={{ flex: 'none' }}>{name}：</span>
    <div style={{ flex: 1 }}>{children}</div>
  </div>
);

const Item = ({ no, children }: { no: string; children: ReactNode }) => (
  <div style={{ display: 'flex', marginBottom: 2 }}>
    <span style={{ flex: 'none', minWidth: '2.6em' }}>{no}</span>
    <span style={{ flex: 1 }}>{children}</span>
  </div>
);

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

const First: DocPage = () => (
  <div style={page}>
    <ArchiveBox code="範例字第000號" keep="永久" />
    <Letterhead agency="範例機關" />
    <Contact
      lines={[
        '地址：000臺北市範例區範例路1號',
        '承辦人：王小明',
        '電話：(02)0000-0000',
        '電子信箱：sample@example.gov.tw',
      ]}
    />

    <Field label="受文者">○○部</Field>
    <div style={{ height: 10 }} />
    <Field label="發文日期">中華民國115年8月16日</Field>
    <Field label="發文字號">範例字第1150000000號</Field>
    <Field label="速別">普通件</Field>
    <Field label="密等及解密條件或保密期限">普通</Field>
    <Field label="附件">如主旨</Field>

    <Section name="主旨">檢送本機關「範例作業要點」修正草案1份，請查照。</Section>

    <Section name="說明">
      <Item no="一、">依據本機關115年度工作計畫辦理。</Item>
      <Item no="二、">旨開要點自發布日施行，原要點同時停止適用。</Item>
      <Item no="三、">後續作業時程請參照續頁所列各項期程辦理。</Item>
    </Section>

    <Footer />
  </div>
);

const Continued: DocPage = () => (
  <div style={page}>
    <Section name="辦法">
      <Item no="一、">請於文到後30日內完成內部作業程序之調整。</Item>
      <Item no="二、">執行過程如有疑義，請逕洽本機關承辦人；必要時另行召開說明會議。</Item>
    </Section>

    <div style={{ marginTop: 18, color: 'var(--od-muted)', fontSize: 'var(--od-size-caption)' }}>
      續頁不重複機關名稱與文別，只延續本文與頁碼。
    </div>

    <Distribution to="○○部" cc="本機關秘書室、資訊室" />
    <Signature title="機關首長" name="○　○　○" />

    <Footer />
  </div>
);

export default [First, Continued] satisfies DocPage[];
