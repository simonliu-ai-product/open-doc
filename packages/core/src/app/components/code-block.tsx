import type { CSSProperties, ReactNode } from 'react';
import { LOC_PROP, sourceAttrs } from '../lib/source-loc';

export type CodeBlockProps = {
  code?: string;
  children?: string;
  lang?: string;
  title?: ReactNode;
  lineNumbers?: boolean;
  /** 1-based line numbers to highlight. */
  highlightLines?: number[];
  style?: CSSProperties;
  className?: string;
  [LOC_PROP]?: string;
};

type TokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'type';

type Token = { kind: TokenKind; text: string };

const KEYWORDS = new Set([
  'import',
  'from',
  'export',
  'default',
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'switch',
  'case',
  'break',
  'continue',
  'async',
  'await',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'class',
  'extends',
  'implements',
  'interface',
  'type',
  'satisfies',
  'as',
  'true',
  'false',
  'null',
  'undefined',
  'def',
  'elif',
  'in',
  'and',
  'or',
  'not',
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP',
  'BY',
  'ORDER',
  'LIMIT',
  'JOIN',
  'ON',
]);

const TOKEN_RE =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_][A-Za-z0-9_]*)\b/g;

function tokenizeLine(line: string): Token[] {
  const out: Token[] = [];
  let cursor = 0;
  for (const match of line.matchAll(TOKEN_RE)) {
    const idx = match.index ?? 0;
    if (idx > cursor) {
      out.push({ kind: 'plain', text: line.slice(cursor, idx) });
    }
    const [full, comment, str, num, ident] = match;
    if (comment !== undefined) {
      out.push({ kind: 'comment', text: full });
    } else if (str !== undefined) {
      out.push({ kind: 'string', text: full });
    } else if (num !== undefined) {
      out.push({ kind: 'number', text: full });
    } else if (ident !== undefined) {
      if (KEYWORDS.has(ident)) {
        out.push({ kind: 'keyword', text: full });
      } else if (/^[A-Z]/.test(ident)) {
        out.push({ kind: 'type', text: full });
      } else {
        out.push({ kind: 'plain', text: full });
      }
    }
    cursor = idx + full.length;
  }
  if (cursor < line.length) {
    out.push({ kind: 'plain', text: line.slice(cursor) });
  }
  return out;
}

function tokenStyle(kind: TokenKind): CSSProperties | undefined {
  switch (kind) {
    case 'keyword':
      return { color: 'var(--od-accent, #2563eb)', fontWeight: 600 };
    case 'string':
      return { color: '#0f766e' };
    case 'comment':
      return { color: 'var(--od-muted, #6b7280)', fontStyle: 'italic' };
    case 'number':
      return { color: '#b45309' };
    case 'type':
      return {
        color: 'color-mix(in srgb, var(--od-accent, #2563eb) 75%, var(--od-text, #16181d))',
        fontWeight: 500,
      };
    default:
      return undefined;
  }
}

/** Marks a framed component whose parts the Word export keeps inside one frame. */
export const PANEL_ATTR = 'data-od-panel';

/**
 * Print-ready syntax-highlighted code block with optional header bar, line
 * numbers, and highlighted lines. Uses `--od-*` variables so it harmonizes with
 * the document's design system and exports cleanly to PDF, HTML, and Word.
 */
export function CodeBlock({
  code,
  children,
  lang,
  title,
  lineNumbers = false,
  highlightLines,
  style,
  className,
  [LOC_PROP]: loc,
}: CodeBlockProps) {
  const raw = (code ?? children ?? '').replace(/^\n+|\s+$/g, '');
  const lines = raw.split('\n');
  const highlighted = new Set(highlightLines ?? []);

  return (
    <div
      {...sourceAttrs(loc)}
      {...{ [PANEL_ATTR]: '' }}
      className={className}
      style={{
        border: '1px solid var(--od-rule, #e5e7eb)',
        borderRadius: 'var(--od-radius, 6px)',
        background: 'color-mix(in srgb, var(--od-text, #16181d) 3%, var(--od-bg, #ffffff))',
        overflow: 'hidden',
        margin: '0 0 12px',
        ...style,
      }}
    >
      {(title || lang) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 12px',
            borderBottom: '1px solid var(--od-rule, #e5e7eb)',
            background: 'color-mix(in srgb, var(--od-text, #16181d) 5%, var(--od-bg, #ffffff))',
            fontFamily: 'var(--od-font-mono, monospace)',
            fontSize: 10.5,
            color: 'var(--od-muted, #6b7280)',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--od-text, #16181d)' }}>{title ?? ''}</span>
          {lang && (
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 9.5 }}>
              {lang}
            </span>
          )}
        </div>
      )}
      <pre
        style={{
          margin: 0,
          padding: '10px 12px',
          fontFamily: 'var(--od-font-mono, monospace)',
          fontSize: 11,
          lineHeight: 1.55,
          color: 'var(--od-text, #16181d)',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {lines.map((line, index) => {
          const lineNo = index + 1;
          const isHighlighted = highlighted.has(lineNo);
          const tokens = tokenizeLine(line);
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: source line order
              key={index}
              style={{
                display: 'flex',
                ...(isHighlighted
                  ? {
                      background: 'color-mix(in srgb, var(--od-accent, #2563eb) 10%, transparent)',
                      margin: '0 -12px',
                      padding: '0 12px',
                      borderLeft: '2.5px solid var(--od-accent, #2563eb)',
                    }
                  : {}),
              }}
            >
              {lineNumbers && (
                <span
                  aria-hidden="true"
                  style={{
                    flex: 'none',
                    width: 24,
                    paddingRight: 8,
                    textAlign: 'right',
                    color: 'var(--od-muted, #6b7280)',
                    userSelect: 'none',
                    fontVariantNumeric: 'tabular-nums',
                    opacity: 0.65,
                  }}
                >
                  {lineNo}
                </span>
              )}
              <span style={{ flex: 1 }}>
                {tokens.length === 0
                  ? '\u00a0'
                  : tokens.map((tok, ti) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: token sequence
                      <span key={ti} style={tokenStyle(tok.kind)}>
                        {tok.text}
                      </span>
                    ))}
              </span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
