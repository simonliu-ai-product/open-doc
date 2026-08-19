import { createElement, isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { Footnote } from '../components/footnote';
import { extractBlockFootnotes, extractSectionFootnotes, notesForPage } from './footnotes';

function childrenOf(node: ReactNode): ReactNode {
  return isValidElement(node) ? (node.props as { children?: ReactNode }).children : undefined;
}

describe('extractBlockFootnotes', () => {
  it('lifts a note out and leaves a marker in its place', () => {
    const block = (
      <p>
        A claim
        <Footnote>Source: Q3 billing export.</Footnote>
        and the rest.
      </p>
    );

    const { node, notes } = extractBlockFootnotes(block, 'fn-0-0');
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe('fn-0-0-1');
    expect(notes[0].content).toBe('Source: Q3 billing export.');

    const rendered = JSON.stringify(node, (key, value) => (key === 'type' ? undefined : value));
    expect(rendered).not.toContain('Source: Q3 billing export.');
    expect(node).not.toBe(block);
  });

  it('honours an author id so a Ref can point at the note', () => {
    const { notes } = extractBlockFootnotes(
      <p>
        x<Footnote id="billing">note</Footnote>
      </p>,
      'fn-0-0',
    );
    expect(notes[0].id).toBe('billing');
  });

  it('finds notes nested several elements deep', () => {
    const { notes } = extractBlockFootnotes(
      <div>
        <ul>
          <li>
            one<Footnote>first</Footnote>
          </li>
          <li>
            two<Footnote>second</Footnote>
          </li>
        </ul>
      </div>,
      'fn-1-2',
    );
    expect(notes.map((note) => note.content)).toEqual(['first', 'second']);
    expect(notes.map((note) => note.id)).toEqual(['fn-1-2-1', 'fn-1-2-2']);
  });

  it('returns the block untouched when it has no footnotes', () => {
    const block = <p>Nothing to lift.</p>;
    const { node, notes } = extractBlockFootnotes(block, 'fn-0-0');
    expect(node).toBe(block);
    expect(notes).toEqual([]);
  });

  it('leaves a render-prop child alone rather than walking into a function', () => {
    const block = createElement('div', null, (() => null) as unknown as ReactNode);
    expect(extractBlockFootnotes(block, 'fn-0-0').node).toBe(block);
  });

  it('keeps surrounding text intact', () => {
    const { node } = extractBlockFootnotes(
      <p>
        before<Footnote>note</Footnote>after
      </p>,
      'fn-0-0',
    );
    const children = childrenOf(node) as ReactNode[];
    expect(children[0]).toBe('before');
    expect(children[2]).toBe('after');
  });
});

describe('extractSectionFootnotes', () => {
  it('keeps notes index-aligned with their blocks', () => {
    const prepared = extractSectionFootnotes(
      [
        <p key="a">plain</p>,
        <p key="b">
          x<Footnote>note</Footnote>
        </p>,
      ],
      0,
    );
    expect(prepared.notesByBlock[0]).toEqual([]);
    expect(prepared.notesByBlock[1]).toHaveLength(1);
  });

  it('collects only the notes belonging to a page', () => {
    const notesByBlock = [[{ id: 'a', content: 'A' }], [], [{ id: 'c', content: 'C' }]];
    expect(notesForPage(notesByBlock, [1, 2]).map((note) => note.id)).toEqual(['c']);
  });
});
