import type { CSSProperties } from 'react';
import { useDocOutline } from '../lib/outline';
import { useDocPageNumber } from '../lib/page-context';

export type TableOfContentsProps = {
  /** Deepest heading level to list. Defaults to 2 (h1 + h2). */
  maxLevel?: number;
  /** Show the page number column with dot leaders. Defaults to true. */
  showPageNumbers?: boolean;
  /** List headings that sit on the same page as the TOC itself. Defaults to false. */
  includeOwnPage?: boolean;
  /** Indent per heading level, in px. Defaults to 20. */
  indent?: number;
  style?: CSSProperties;
  className?: string;
};

/**
 * Renders the document's headings as a contents list. The outline is filled in
 * by a DOM scan after the pages render, so this component is empty on the very
 * first pass and populated on the next — including during PDF/HTML export,
 * which scans before serializing.
 */
export function TableOfContents({
  maxLevel = 2,
  showPageNumbers = true,
  includeOwnPage = false,
  indent = 20,
  style,
  className,
}: TableOfContentsProps) {
  const outline = useDocOutline();
  const ownPage = useDocPageNumber();

  const entries = outline.filter(
    (entry) => entry.level <= maxLevel && (includeOwnPage || entry.page !== ownPage),
  );

  return (
    <div
      data-od-toc=""
      className={className}
      style={{
        fontFamily: 'var(--od-font-body)',
        fontSize: 'var(--od-size-body)',
        color: 'var(--od-text)',
        ...style,
      }}
    >
      {entries.map((entry) => (
        <div
          key={entry.id}
          /* Which heading this line stands for. The inspector follows it: a
           * contents row holds no text of its own, so clicking one has to land
           * on the heading that produced it. */
          data-od-toc-entry={entry.id}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            paddingLeft: (entry.level - 1) * indent,
            marginBottom: entry.level === 1 ? 10 : 6,
            fontWeight: entry.level === 1 ? 600 : 400,
            color: entry.level === 1 ? 'var(--od-text)' : 'var(--od-muted)',
          }}
        >
          <span>{entry.text}</span>
          {showPageNumbers && (
            <>
              <span
                aria-hidden
                style={{
                  flex: 1,
                  borderBottom: '1px dotted var(--od-rule)',
                  transform: 'translateY(-3px)',
                }}
              />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{entry.page}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
