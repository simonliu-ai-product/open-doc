import type { CSSProperties, ReactNode } from 'react';
import type { DesignSystem } from '../lib/design';
import type { FlowSection } from '../lib/flow';
import type { ExtractedNote } from '../lib/footnotes';
import { PAGE_ATTR, PAGE_INDEX_ATTR } from '../lib/outline';
import { DocPageProvider, useDocPageCount } from '../lib/page-context';
import { Footnotes } from './footnote';

export const FLOW_BLOCK_ATTR = 'data-od-flow-block';
/** Around the section's footer, as `display: contents` so it lays out as if absent. */
export const FLOW_FOOTER_ATTR = 'data-od-flow-footer';

/**
 * The page shell a flow section renders into. The framework owns the margin and
 * base typography here — that is the trade for not hand-splitting pages — while
 * the blocks keep their own styles.
 *
 * It is a column so the footnote area can sit at the foot of the sheet rather
 * than immediately under the last paragraph. The blocks stay inside one block
 * container, so their margins collapse exactly as they did when measured.
 */
export function flowShellStyle(design: DesignSystem | undefined, padding?: number): CSSProperties {
  return {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    padding: padding ?? design?.margin ?? 76,
    background: 'var(--od-bg)',
    color: 'var(--od-text)',
    fontFamily: 'var(--od-font-body)',
    fontSize: 'var(--od-size-body)',
    lineHeight: 'var(--od-leading)',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };
}

/**
 * With a `sheet`, the block is a page frame of its own: the outline and
 * numbering scans, and `useDocPageNumber()`, see the sheet it printed on even
 * when it is laid out in one continuous column.
 */
export function FlowBlock({ children, sheet }: { children?: ReactNode; sheet?: number }) {
  const total = useDocPageCount();
  if (sheet === undefined) return <div {...{ [FLOW_BLOCK_ATTR]: '' }}>{children}</div>;
  return (
    <div {...{ [FLOW_BLOCK_ATTR]: '', [PAGE_ATTR]: '', [PAGE_INDEX_ATTR]: sheet }}>
      <DocPageProvider index={sheet} total={total}>
        {children}
      </DocPageProvider>
    </div>
  );
}

export function FlowPage({
  section,
  design,
  blockIndices,
  blocks,
  notes,
  sheets,
}: {
  section: FlowSection;
  design: DesignSystem | undefined;
  blockIndices: number[];
  /** Blocks with footnotes already lifted out; falls back to the authored ones. */
  blocks?: ReactNode[];
  notes?: ExtractedNote[];
  /** Block index → the sheet it printed on, for a copy laid out as one column. */
  sheets?: ReadonlyMap<number, number>;
}) {
  const Footer = section.footer;
  const source = blocks ?? section.blocks;
  return (
    <div style={flowShellStyle(design, section.padding)}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {blockIndices.map((index) => (
          <FlowBlock key={index} sheet={sheets?.get(index)}>
            {source[index]}
          </FlowBlock>
        ))}
      </div>
      {notes && notes.length > 0 && <Footnotes notes={notes} />}
      {Footer && (
        <div {...{ [FLOW_FOOTER_ATTR]: '' }} style={{ display: 'contents' }}>
          <Footer />
        </div>
      )}
    </div>
  );
}
