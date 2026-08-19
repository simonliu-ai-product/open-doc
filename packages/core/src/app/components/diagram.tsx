import type { CSSProperties, ReactNode } from 'react';
import type { LabelKind } from '../lib/labels';
import { Figure } from './numbering';

export type DiagramSource = {
  svg: string;
  width: number;
  height: number;
};

export type DiagramProps = {
  /** The compiled module from `import chart from './architecture.mmd'`. */
  chart: DiagramSource;
  /** Caption text. Given one, the drawing is numbered like any other figure. */
  caption?: ReactNode;
  captionText?: string;
  kind?: LabelKind;
  id?: string;
  /**
   * Drawn width in CSS px. Defaults to the diagram's natural size, capped to
   * the column — a diagram wider than the text block is a layout fault, and
   * `open-doc check` would report it as one.
   */
  width?: number;
  align?: 'left' | 'center';
  style?: CSSProperties;
  className?: string;
};

/**
 * A diagram compiled from Mermaid-flavoured text at build time. The SVG is
 * inlined rather than referenced through `<img>` so it inherits the document's
 * theme variables — an `<img src="data:…">` would be painted in a document of
 * its own, with none of this one's colours or faces.
 */
export function Diagram({
  chart,
  caption,
  captionText,
  kind = 'figure',
  id,
  width,
  align = 'center',
  style,
  className,
}: DiagramProps) {
  const drawing = (
    <div
      className={caption ? undefined : className}
      style={{
        width: width ?? chart.width,
        maxWidth: '100%',
        marginLeft: align === 'center' ? 'auto' : undefined,
        marginRight: align === 'center' ? 'auto' : undefined,
        ...(caption ? undefined : style),
      }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the SVG is produced by this package's own renderer at build time, never from document input at runtime
      dangerouslySetInnerHTML={{ __html: chart.svg }}
    />
  );

  if (!caption) return drawing;

  return (
    <Figure
      {...(id ? { id } : {})}
      caption={caption}
      {...(captionText ? { captionText } : {})}
      kind={kind}
      className={className}
      {...(style ? { style } : {})}
    >
      {drawing}
    </Figure>
  );
}
