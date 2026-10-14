import { type CSSProperties, createContext, type ReactNode, useContext } from 'react';
import type { DesignSystem } from '../lib/design';
import type { BlockSlice, FlowSection } from '../lib/flow';
import type { ExtractedNote } from '../lib/footnotes';
import { Footnotes } from './footnote';

export const FLOW_BLOCK_ATTR = 'data-od-flow-block';

export type TableSliceRange = { rowStart: number; rowEnd: number };

const SLICE_CONTEXT_KEY = '__open_doc_table_slice_context__';
type GlobalWithSlice = typeof globalThis & {
  [SLICE_CONTEXT_KEY]?: ReturnType<typeof createContext<TableSliceRange | null>>;
};
const g = globalThis as GlobalWithSlice;
if (!g[SLICE_CONTEXT_KEY]) {
  g[SLICE_CONTEXT_KEY] = createContext<TableSliceRange | null>(null);
}
const TableSliceContext = g[SLICE_CONTEXT_KEY];

export function useTableSlice(): TableSliceRange | null {
  return useContext(TableSliceContext);
}

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

export function FlowBlock({
  slice,
  children,
}: {
  slice?: TableSliceRange | null;
  children?: ReactNode;
}) {
  const inner = <div {...{ [FLOW_BLOCK_ATTR]: '' }}>{children}</div>;
  if (!slice) return inner;
  return <TableSliceContext.Provider value={slice}>{inner}</TableSliceContext.Provider>;
}

export function FlowPage({
  section,
  design,
  blockIndices,
  blockSlices,
  blocks,
  notes,
}: {
  section: FlowSection;
  design: DesignSystem | undefined;
  blockIndices: number[];
  blockSlices?: BlockSlice[];
  /** Blocks with footnotes already lifted out; falls back to the authored ones. */
  blocks?: ReactNode[];
  notes?: ExtractedNote[];
}) {
  const Header = section.header;
  const Footer = section.footer;
  const source = blocks ?? section.blocks;
  const items: BlockSlice[] = blockSlices ?? blockIndices.map((index) => ({ index }));
  const cols = section.columns && section.columns > 1 ? section.columns : 1;

  return (
    <div style={flowShellStyle(design, section.padding)}>
      {Header && <Header />}
      <div
        style={{
          flex: cols > 1 ? 'none' : 1,
          minHeight: 0,
          ...(cols > 1
            ? {
                columnCount: cols,
                columnGap: section.columnGap ?? 24,
                columnFill: 'balance',
              }
            : {}),
        }}
      >
        {items.map((item) => {
          const slice =
            item.rowStart !== undefined && item.rowEnd !== undefined
              ? { rowStart: item.rowStart, rowEnd: item.rowEnd }
              : null;
          return (
            <FlowBlock key={`${item.index}-${item.rowStart ?? 0}`} slice={slice}>
              {source[item.index]}
            </FlowBlock>
          );
        })}
      </div>
      {notes && notes.length > 0 && <Footnotes notes={notes} />}
      {Footer && <Footer />}
    </div>
  );
}
