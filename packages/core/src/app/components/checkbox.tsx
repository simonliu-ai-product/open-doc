import type { CSSProperties } from 'react';

export type CheckboxProps = {
  /** Ticked. Toggle this to fill in a form. */
  checked?: boolean;
  /** The mark a ticked box shows: a tick (default) or a cross, as ☑ and ☒. */
  mark?: 'tick' | 'cross';
  style?: CSSProperties;
  className?: string;
};

/**
 * A box on a form to tick: ☐, or ☑ when `checked`. Drawn rather than typed,
 * so it keeps one size and look in any font — ☑ is missing from most CJK
 * faces, and the fallback a browser picks draws it smaller than the □ beside
 * it. It takes a character's width in the text it sits in.
 */
export function Checkbox({ checked = false, mark = 'tick', style, className }: CheckboxProps) {
  return (
    <span
      role="img"
      aria-label={checked ? (mark === 'cross' ? '☒' : '☑') : '☐'}
      data-od-checkbox={checked ? 'checked' : ''}
      className={className}
      style={{
        display: 'inline-block',
        position: 'relative',
        boxSizing: 'border-box',
        width: '0.8em',
        height: '0.8em',
        margin: '0 0.1em',
        border: '0.07em solid currentColor',
        verticalAlign: '-0.1em',
        textIndent: 0,
        lineHeight: 1,
        ...style,
      }}
    >
      {checked && (
        <svg
          viewBox="0 0 10 10"
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            overflow: 'visible',
          }}
        >
          {mark === 'cross' ? (
            <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1.2" fill="none" />
          ) : (
            <path
              d="M1.8 5.2 L4.1 7.6 L8.6 2.2"
              stroke="currentColor"
              strokeWidth="1.3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      )}
    </span>
  );
}
