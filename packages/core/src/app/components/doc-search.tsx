/**
 * Find text in the document.
 *
 * Matches are drawn with the CSS Custom Highlight API, which paints ranges held
 * beside the DOM instead of wrapping anything in it. Wrapping would mean editing
 * a tree React owns: the next render throws the marks away, or keeps them and
 * loses the reader's place. Neither is recoverable from inside a highlighter.
 *
 * A browser without the API still gets working navigation — the view scrolls to
 * each hit — it just cannot tint it. That is worth having; refusing to search at
 * all because it cannot be coloured is not.
 */

import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ALL = 'od-search';
const ACTIVE = 'od-search-active';

type Hit = { range: Range; page: number };

/* Case-insensitive, and accent-insensitive where the browser can be: a reader
   searching for "resume" means the word, not the spelling with accents. Defined
   outside the component so it is one function, not a new one every render —
   which is also what stops it having to appear in a dependency list. */
const fold = (value: string): string => value.normalize('NFKD').toLowerCase();

const highlightsSupported = (): boolean =>
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

function clearHighlights(): void {
  if (!highlightsSupported()) return;
  CSS.highlights.delete(ALL);
  CSS.highlights.delete(ACTIVE);
}

/**
 * Every text node under `root`, in document order.
 *
 * Script and style hold text that is not the document's text; matching inside
 * them would send the reader to a hit they cannot see.
 */
function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('script,style,[data-od-search-skip]')) return NodeFilter.FILTER_REJECT;
      return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const out: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    out.push(node as Text);
    node = walker.nextNode();
  }
  return out;
}

function pageOf(node: Node, frames: Element[]): number {
  const element = node.parentElement;
  if (!element) return 0;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i]?.contains(element)) return i + 1;
  }
  return 0;
}

export function DocSearch({
  scrollRef,
  pagesRef,
  onFoundPage,
}: {
  scrollRef: React.RefObject<HTMLElement | null>;
  pagesRef: React.RefObject<HTMLElement | null>;
  onFoundPage?: (page: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [at, setAt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const supported = useMemo(highlightsSupported, []);

  const search = useCallback(
    (text: string) => {
      const root = pagesRef.current;
      if (!root || text.trim() === '') {
        clearHighlights();
        setHits([]);
        setAt(0);
        return;
      }

      const needle = fold(text);
      const frames = Array.from(root.children);
      const found: Hit[] = [];

      for (const node of textNodes(root)) {
        const haystack = fold(node.nodeValue ?? '');
        let from = haystack.indexOf(needle);
        while (from !== -1) {
          const range = document.createRange();
          try {
            range.setStart(node, from);
            range.setEnd(node, from + needle.length);
            found.push({ range, page: pageOf(node, frames) });
          } catch {
            /* Folding can change length, which puts the offset past the node.
               Skipping that hit is better than throwing away the whole search. */
          }
          from = haystack.indexOf(needle, from + needle.length);
        }
      }

      setHits(found);
      setAt(found.length > 0 ? 1 : 0);
    },
    [pagesRef],
  );

  /* Painting is a side effect of the hits and the cursor, not of typing —
     otherwise the active hit stays tinted after the reader moves off it. */
  useEffect(() => {
    if (!supported) return;
    if (hits.length === 0) {
      clearHighlights();
      return;
    }
    const active = hits[at - 1];
    CSS.highlights.set(ALL, new Highlight(...hits.map((hit) => hit.range)));
    if (active) CSS.highlights.set(ACTIVE, new Highlight(active.range));
    return clearHighlights;
  }, [hits, at, supported]);

  const go = useCallback(
    (step: number) => {
      if (hits.length === 0) return;
      const next = ((at - 1 + step + hits.length) % hits.length) + 1;
      setAt(next);
      const hit = hits[next - 1];
      if (!hit) return;
      const target = hit.range.startContainer.parentElement;
      const root = scrollRef.current;
      if (target && root) {
        const offset = target.getBoundingClientRect().top - root.getBoundingClientRect().top;
        root.scrollTo({ top: root.scrollTop + offset - 120, behavior: 'smooth' });
      }
      if (hit.page > 0) onFoundPage?.(hit.page);
    },
    [at, hits, scrollRef, onFoundPage],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    clearHighlights();
    setHits([]);
    setAt(0);
  }, []);

  /* No ⌘F: that is the browser's own find, and taking it would replace a
     control the reader already trusts with one that only searches this pane. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => () => clearHighlights(), []);

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Find in document"
        title="Find in document"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Search className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 focus-within:border-foreground/40">
      <Search className="size-3.5 flex-none text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          search(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            go(event.shiftKey ? -1 : 1);
          }
        }}
        placeholder="Find"
        aria-label="Find in document"
        className="w-28 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
      <span className="flex-none font-mono text-[11px] text-muted-foreground tabular-nums">
        {query === '' ? '' : hits.length === 0 ? '0' : `${at}/${hits.length}`}
      </span>
      <button
        type="button"
        aria-label="Previous match"
        title="Previous match (⇧⏎)"
        onClick={() => go(-1)}
        disabled={hits.length === 0}
        className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <ChevronUp className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Next match"
        title="Next match (⏎)"
        onClick={() => go(1)}
        disabled={hits.length === 0}
        className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <ChevronDown className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Close search"
        title="Close search (Esc)"
        onClick={close}
        className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
