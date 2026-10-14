import type { CSSProperties, ReactNode } from 'react';
import { LOC_PROP, sourceAttrs } from '../lib/source-loc';

export type CalloutVariant = 'info' | 'tip' | 'warning' | 'danger' | 'neutral';

export type CalloutProps = {
  variant?: CalloutVariant;
  title?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  [LOC_PROP]?: string;
};

const PALETTES: Record<
  CalloutVariant,
  { border: string; bg: string; badge: string; label: string }
> = {
  info: {
    border: 'var(--od-accent, #2563eb)',
    bg: 'color-mix(in srgb, var(--od-accent, #2563eb) 7%, var(--od-bg, #ffffff))',
    badge: 'var(--od-accent, #2563eb)',
    label: 'NOTE',
  },
  tip: {
    border: '#15803d',
    bg: 'color-mix(in srgb, #15803d 7%, var(--od-bg, #ffffff))',
    badge: '#15803d',
    label: 'TIP',
  },
  warning: {
    border: '#b45309',
    bg: 'color-mix(in srgb, #d97706 8%, var(--od-bg, #ffffff))',
    badge: '#b45309',
    label: 'WARNING',
  },
  danger: {
    border: '#b91c1c',
    bg: 'color-mix(in srgb, #dc2626 7%, var(--od-bg, #ffffff))',
    badge: '#b91c1c',
    label: 'CRITICAL',
  },
  neutral: {
    border: 'var(--od-muted, #6b7280)',
    bg: 'color-mix(in srgb, var(--od-text, #16181d) 4%, var(--od-bg, #ffffff))',
    badge: 'var(--od-muted, #6b7280)',
    label: 'SUMMARY',
  },
};

/**
 * A structured admonition box (`info`, `tip`, `warning`, `danger`, `neutral`)
 * rendered as a `<blockquote data-od-callout>` so Word and PDF exporters keep
 * its panel border and shading intact.
 */
export function Callout({
  variant = 'info',
  title,
  children,
  style,
  className,
  [LOC_PROP]: loc,
}: CalloutProps) {
  const palette = PALETTES[variant] ?? PALETTES.info;

  return (
    <blockquote
      {...sourceAttrs(loc)}
      data-od-callout={variant}
      className={className}
      style={{
        margin: '4px 0 12px',
        padding: '10px 14px',
        borderLeft: `3px solid ${palette.border}`,
        background: palette.bg,
        borderRadius: '0 var(--od-radius, 4px) var(--od-radius, 4px) 0',
        color: 'var(--od-text, #16181d)',
        fontStyle: 'normal',
        fontSize: '0.95em',
        lineHeight: 1.55,
        ...style,
      }}
    >
      {title !== undefined && (
        <div
          style={{
            fontFamily: 'var(--od-font-heading, sans-serif)',
            fontWeight: 650,
            fontSize: '0.92em',
            color: palette.badge,
            marginBottom: 4,
            letterSpacing: '0.01em',
          }}
        >
          {typeof title === 'string' ? <span {...sourceAttrs(loc, 'title')}>{title}</span> : title}
        </div>
      )}
      <div>{children}</div>
    </blockquote>
  );
}
