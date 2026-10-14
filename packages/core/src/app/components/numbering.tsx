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
import { LOC_PROP, sourceAttrs } from '../lib/source-loc';

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
  /** When false, prints the caption without registering a new label number (e.g. continued table slices). */
  numbered?: boolean;
  style?: CSSProperties;
  captionStyle?: CSSProperties;
  className?: string;
  children?: ReactNode;
  /** Stamped in dev by the loc-tags plugin; see `lib/source-loc.ts`. */
  [LOC_PROP]?: string;
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
  numbered = true,
  style,
  captionStyle,
  className,
  children,
  [LOC_PROP]: loc,
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
      {numbered && (
        <span style={{ fontWeight: 600, color: 'var(--od-text)' }}>
          {nameFor(kind, vocabulary)} {entry?.number ?? ''}
        </span>
      )}
      {typeof caption === 'string' || typeof caption === 'number' ? (
        <span>
          {numbered ? ' — ' : ''}
          <span {...sourceAttrs(loc, 'caption')}>{caption}</span>
        </span>
      ) : caption ? (
        <span>
          {numbered ? ' — ' : ''}
          {caption}
        </span>
      ) : null}
    </figcaption>
  ) : null;

  return (
    <figure
      {...(numbered
        ? {
            [LABEL_ATTR]: kind,
            [LABEL_ID_ATTR]: labelId,
            [LABEL_TEXT_ATTR]: text,
            ...sourceAttrs(loc),
          }
        : sourceAttrs(loc))}
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

  const name =
    entry.kind === 'footnote' || entry.kind === 'citation'
      ? ''
      : `${nameFor(entry.kind, vocabulary)} `;
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
          data-od-list-entry={entry.id}
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

export type CiteProps = {
  /** Stable citation key (e.g. 'rfc9110' or 'q3-audit'). */
  id: string;
  /** Citation details printed in `<Bibliography />`. Needs only to be supplied on one `<Cite>` for that id, or in `<Bibliography items={...} />`. */
  source?: string;
  style?: CSSProperties;
  className?: string;
};

/**
 * An inline bibliographic citation (`[1]`), numbered in order of first
 * appearance across the rendered pages. Multiple `<Cite id="x" />` calls share
 * the same number.
 */
export function Cite({ id, source, style, className }: CiteProps) {
  const entry = useDocLabel(id, 'citation');
  return (
    <span
      {...{
        [LABEL_ATTR]: 'citation',
        [LABEL_ID_ATTR]: id,
        ...(source ? { [LABEL_TEXT_ATTR]: source } : {}),
      }}
      data-od-cite={id}
      className={className}
      style={{
        fontSize: '0.82em',
        verticalAlign: 'super',
        lineHeight: 0,
        fontWeight: 600,
        color: 'var(--od-accent)',
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      [{entry?.number ?? '·'}]
    </span>
  );
}

export type BibliographyItem = {
  id?: string;
  title?: ReactNode;
  source?: ReactNode;
  author?: string;
  year?: string | number;
  url?: string;
  note?: string;
};

export type BibliographyProps = {
  /** Optional catalog of reference details keyed by citation `id` (or an array with `id`). Merged with inline `<Cite source="..." />` texts. */
  items?: Record<string, string | BibliographyItem> | BibliographyItem[];
  /** Optional heading text above the reference list. Pass `""` to omit. */
  title?: ReactNode;
  /** Show page numbers where each citation first appeared. */
  showPageNumbers?: boolean;
  style?: CSSProperties;
  className?: string;
};

function renderBibItem(spec: string | BibliographyItem | undefined, fallback: string): ReactNode {
  if (!spec) return fallback;
  if (typeof spec === 'string') return spec;
  if (spec.source && !spec.title) return spec.source;
  return (
    <span>
      {spec.author ? `${spec.author}. ` : ''}
      <strong style={{ fontWeight: 600, color: 'var(--od-text)' }}>{spec.title}</strong>
      {spec.year ? ` (${spec.year}).` : '.'}
      {spec.note ? ` ${spec.note}` : ''}
      {spec.url ? (
        <>
          {' '}
          <span
            style={{
              fontFamily: 'var(--od-font-mono)',
              fontSize: '0.92em',
              color: 'var(--od-muted)',
            }}
          >
            {spec.url}
          </span>
        </>
      ) : null}
    </span>
  );
}

/**
 * Renders the numbered list of all `<Cite>` references in order of appearance,
 * plus any additional uncited entries passed in `items`.
 */
export function Bibliography({
  items,
  title,
  showPageNumbers = false,
  style,
  className,
}: BibliographyProps) {
  const cited = useDocLabels('citation');
  const vocabulary = useLabelVocabulary();

  const map = new Map<string, string | BibliographyItem>();
  if (Array.isArray(items)) {
    items.forEach((item, idx) => {
      map.set(item.id ?? `bib-${idx + 1}`, item);
    });
  } else if (items) {
    for (const [k, v] of Object.entries(items)) map.set(k, v);
  }

  const rows: Array<{ id: string; number: number; content: ReactNode; page?: number }> = cited.map(
    (entry) => ({
      id: entry.id,
      number: entry.number,
      content: renderBibItem(map.get(entry.id), entry.text || entry.id),
      page: entry.page,
    }),
  );

  for (const [id, spec] of map.entries()) {
    if (!rows.some((r) => r.id === id)) {
      rows.push({
        id,
        number: rows.length + 1,
        content: renderBibItem(spec, id),
      });
    }
  }

  const heading = title !== undefined ? title : vocabulary.bibliography;

  return (
    <div
      data-od-bibliography=""
      className={className}
      style={{
        fontFamily: 'var(--od-font-body)',
        fontSize: 'var(--od-size-caption, 11px)',
        lineHeight: 1.55,
        color: 'var(--od-text)',
        margin: '8px 0 14px',
        ...style,
      }}
    >
      {heading ? (
        <div
          style={{
            fontFamily: 'var(--od-font-heading)',
            fontSize: 'var(--od-size-h3, 14px)',
            fontWeight: 600,
            marginBottom: 8,
            color: 'var(--od-text)',
          }}
        >
          {heading}
        </div>
      ) : null}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {rows.map((row) => (
          <li
            key={row.id}
            data-od-bib-entry={row.id}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              marginBottom: 5,
            }}
          >
            <span
              style={{
                flex: 'none',
                minWidth: 24,
                fontWeight: 600,
                color: 'var(--od-accent)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              [{row.number}]
            </span>
            <span style={{ flex: 1, color: 'var(--od-text)' }}>{row.content}</span>
            {showPageNumbers && row.page !== undefined && (
              <span
                style={{
                  flex: 'none',
                  color: 'var(--od-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                p. {row.page}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
