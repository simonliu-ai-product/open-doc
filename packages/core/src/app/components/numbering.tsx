import { type CSSProperties, type ReactNode, useId } from 'react';
import {
  formatOnPage,
  LABEL_ATTR,
  LABEL_ID_ATTR,
  LABEL_TEXT_ATTR,
  type LabelKind,
  useDocLabel,
  useDocLabels,
  useLabelVocabulary,
} from '../lib/labels';
import { useDocPageNumber } from '../lib/page-context';

function nameFor(kind: LabelKind, vocabulary: { figure: string; table: string }): string {
  return kind === 'table' ? vocabulary.table : vocabulary.figure;
}

export type FigureProps = {
  /** Stable id, so `<Ref to>` can point at it. Generated when omitted. */
  id?: string;
  /** What the caption says after the number. */
  caption?: ReactNode;
  /** `figure` numbers with figures, `table` with tables. Defaults to `figure`. */
  kind?: LabelKind;
  /** Tables conventionally caption above, figures below. */
  captionPosition?: 'above' | 'below';
  /** Plain-text caption for the list of figures, when `caption` carries markup. */
  captionText?: string;
  style?: CSSProperties;
  captionStyle?: CSSProperties;
  className?: string;
  children?: ReactNode;
};

/**
 * A numbered figure or table. The number comes from a scan of the rendered
 * pages, not from a counter in the source, so inserting a figure halfway
 * through a document renumbers everything after it — including the references
 * to it — without anyone editing a number.
 *
 * Caption and content are one block, so a `flow()` section never separates them.
 */
export function Figure({
  id,
  caption,
  kind = 'figure',
  captionPosition,
  captionText,
  style,
  captionStyle,
  className,
  children,
}: FigureProps) {
  const generated = useId();
  const labelId = id ?? generated;
  const entry = useDocLabel(labelId);
  const vocabulary = useLabelVocabulary();
  const position = captionPosition ?? (kind === 'table' ? 'above' : 'below');

  const text =
    captionText ??
    (typeof caption === 'string' || typeof caption === 'number' ? String(caption) : '');

  const captionNode = caption ? (
    <figcaption
      style={{
        fontSize: 'var(--od-size-caption)',
        color: 'var(--od-muted)',
        lineHeight: 1.4,
        margin: position === 'above' ? '0 0 6px' : '6px 0 0',
        ...captionStyle,
      }}
    >
      <span style={{ fontWeight: 600, color: 'var(--od-text)' }}>
        {nameFor(kind, vocabulary)} {entry?.number ?? ''}
      </span>
      {caption ? <span> — {caption}</span> : null}
    </figcaption>
  ) : null;

  return (
    <figure
      {...{
        [LABEL_ATTR]: kind,
        [LABEL_ID_ATTR]: labelId,
        [LABEL_TEXT_ATTR]: text,
      }}
      className={className}
      style={{ margin: '0 0 16px', ...style }}
    >
      {position === 'above' && captionNode}
      {children}
      {position === 'below' && captionNode}
    </figure>
  );
}

export type RefProps = {
  /** The `id` of a `<Figure>` or `<Footnote>`. */
  to: string;
  /**
   * Append the page. `auto` (the default) adds it only when the target sits on
   * another sheet, which is the only time a reader needs it.
   */
  showPage?: boolean | 'auto';
  style?: CSSProperties;
  className?: string;
};

/**
 * A cross-reference that resolves after layout: "Figure 3", plus the page when
 * the target is elsewhere. Never write "see Figure 3 on page 12" by hand — both
 * numbers move.
 */
export function Ref({ to, showPage = 'auto', style, className }: RefProps) {
  const entry = useDocLabel(to);
  const vocabulary = useLabelVocabulary();
  const here = useDocPageNumber();

  if (!entry) {
    // Visible on the page and reported by `open-doc check`: a reference that
    // resolves to nothing is a broken document, not a blank space.
    return (
      <span
        data-od-ref-unresolved={to}
        className={className}
        style={{ color: 'var(--od-accent)', ...style }}
      >
        [?{to}]
      </span>
    );
  }

  const name = entry.kind === 'footnote' ? '' : `${nameFor(entry.kind, vocabulary)} `;
  const withPage = showPage === 'auto' ? entry.page !== here : showPage;

  return (
    <span data-od-ref={to} className={className} style={style}>
      {name}
      {entry.number}
      {withPage ? formatOnPage(vocabulary, entry.page) : ''}
    </span>
  );
}

export type ListOfProps = {
  kind?: LabelKind;
  /** Show the page number column with dot leaders. Defaults to true. */
  showPageNumbers?: boolean;
  style?: CSSProperties;
  className?: string;
};

/**
 * The document's figures or tables as a contents list. Same lifecycle as
 * `<TableOfContents>`: empty on the first render pass, filled once the scan has
 * run — including before an export serializes.
 */
export function ListOf({ kind = 'figure', showPageNumbers = true, style, className }: ListOfProps) {
  const entries = useDocLabels(kind);
  const vocabulary = useLabelVocabulary();

  return (
    <div
      data-od-list-of={kind}
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
          style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}
        >
          <span style={{ flex: 'none', color: 'var(--od-muted)' }}>
            {nameFor(kind, vocabulary)} {entry.number}
          </span>
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

export function ListOfFigures(props: Omit<ListOfProps, 'kind'>) {
  return <ListOf {...props} kind="figure" />;
}

export function ListOfTables(props: Omit<ListOfProps, 'kind'>) {
  return <ListOf {...props} kind="table" />;
}
