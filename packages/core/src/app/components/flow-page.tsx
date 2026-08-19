import type { CSSProperties, ReactNode } from 'react';
import type { DesignSystem } from '../lib/design';
import type { FlowSection } from '../lib/flow';
import type { ExtractedNote } from '../lib/footnotes';
import { Footnotes } from './footnote';

export const FLOW_BLOCK_ATTR = 'data-od-flow-block';

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

export function FlowBlock({ children }: { children?: ReactNode }) {
  return <div {...{ [FLOW_BLOCK_ATTR]: '' }}>{children}</div>;
}

export function FlowPage({
  section,
  design,
  blockIndices,
  blocks,
  notes,
}: {
  section: FlowSection;
  design: DesignSystem | undefined;
  blockIndices: number[];
  /** Blocks with footnotes already lifted out; falls back to the authored ones. */
  blocks?: ReactNode[];
  notes?: ExtractedNote[];
}) {
  const Footer = section.footer;
  const source = blocks ?? section.blocks;
  return (
    <div style={flowShellStyle(design, section.padding)}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {blockIndices.map((index) => (
          <FlowBlock key={index}>{source[index]}</FlowBlock>
        ))}
      </div>
      {notes && notes.length > 0 && <Footnotes notes={notes} />}
      {Footer && <Footer />}
    </div>
  );
}
