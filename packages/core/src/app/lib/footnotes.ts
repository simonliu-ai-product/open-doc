import { Children, cloneElement, createElement, isValidElement, type ReactNode } from 'react';
import { FOOTNOTE_MARKER_FLAG, FootnoteMarker } from '../components/footnote';

export type ExtractedNote = { id: string; content: ReactNode };

export type ExtractedBlock = {
  /** The block with each `<Footnote>` swapped for its marker. */
  node: ReactNode;
  notes: ExtractedNote[];
};

/** Identified by a flag on the function, not by identity — core exists twice at runtime. */
function isFootnoteElement(node: ReactNode): boolean {
  if (!isValidElement(node)) return false;
  const type = node.type as unknown;
  if (typeof type !== 'function') return false;
  return (type as unknown as Record<string, unknown>)[FOOTNOTE_MARKER_FLAG] === true;
}

/**
 * Lifts the notes out of a block and leaves the markers behind.
 *
 * A footnote occupies space at the foot of its page, which is space the packer
 * cannot give to body content — so the notes have to be known *before*
 * pagination, not discovered while rendering it. Walking the block's element
 * tree is what makes that possible, and the trade is that a `<Footnote>` has to
 * appear in the JSX you hand to `flow()`: one hidden inside a component's own
 * body is invisible here and stays inline.
 */
export function extractBlockFootnotes(node: ReactNode, idPrefix: string): ExtractedBlock {
  const notes: ExtractedNote[] = [];

  const walkChildren = (children: ReactNode): ReactNode => {
    if (Array.isArray(children)) {
      let changed = false;
      const mapped = Children.map(children, (child) => {
        const next = walk(child);
        if (next !== child) changed = true;
        return next;
      });
      return changed ? mapped : children;
    }
    return walk(children);
  };

  const walk = (current: ReactNode): ReactNode => {
    if (!isValidElement(current)) return current;

    if (isFootnoteElement(current)) {
      const props = current.props as { id?: string; children?: ReactNode };
      const id = props.id ?? `${idPrefix}-${notes.length + 1}`;
      notes.push({ id, content: props.children });
      return createElement(FootnoteMarker, { key: current.key ?? id, id });
    }

    const props = current.props as { children?: ReactNode };
    // A render-prop child is a function, not a tree — there is nothing to walk.
    if (props.children === undefined || typeof props.children === 'function') return current;

    const next = walkChildren(props.children);
    return next === props.children ? current : cloneElement(current, undefined, next);
  };

  const walked = walk(node);
  return { node: walked, notes };
}

export type PreparedSection = {
  blocks: ReactNode[];
  /** Notes per block, index-aligned with `blocks`. */
  notesByBlock: ExtractedNote[][];
};

export function extractSectionFootnotes(
  blocks: ReactNode[],
  sectionIndex: number,
): PreparedSection {
  const out: PreparedSection = { blocks: [], notesByBlock: [] };
  blocks.forEach((block, blockIndex) => {
    const extracted = extractBlockFootnotes(block, `fn-${sectionIndex}-${blockIndex}`);
    out.blocks.push(extracted.node);
    out.notesByBlock.push(extracted.notes);
  });
  return out;
}

export function notesForPage(
  notesByBlock: ExtractedNote[][],
  blockIndices: number[],
): ExtractedNote[] {
  const out: ExtractedNote[] = [];
  for (const index of blockIndices) out.push(...(notesByBlock[index] ?? []));
  return out;
}
