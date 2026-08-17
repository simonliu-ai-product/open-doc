import { Check, Loader2, MessageSquarePlus, X } from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { candidateLocs, formatLocs } from '../../lib/inspector/fiber';

type TextPart = { kind: 'text'; index: number; value: string } | { kind: 'markup'; label: string };

type ResolvedTarget = {
  line: number;
  column: number;
  editable: boolean;
  text: string;
  parts: TextPart[];
  reason?: string;
};

export const LOC_ATTR = 'data-od-loc';

export type InspectorTarget = {
  line: number;
  column: number;
  anchor: HTMLElement;
  tag: string;
};

// Same visual language as open-slide's inspector: dashed on hover, solid on
// selection, both in the same blue.
const FRAME_STYLE: Record<'hover' | 'selected', CSSProperties> = {
  hover: { outline: '1.5px dashed #3b82f6', background: 'rgba(59,130,246,0.05)' },
  selected: { outline: '2px solid #3b82f6', background: 'rgba(59,130,246,0.1)' },
};

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function targetFrom(el: Element | null): InspectorTarget | null {
  const host = (el as HTMLElement | null)?.closest?.(`[${LOC_ATTR}]`) as HTMLElement | null;
  const raw = host?.getAttribute(LOC_ATTR);
  if (!host || !raw) return null;
  const [line, column] = raw.split(':').map(Number);
  if (!Number.isFinite(line) || !Number.isFinite(column)) return null;
  return { line, column, anchor: host, tag: host.tagName.toLowerCase() };
}

type Rect = { left: number; top: number; width: number; height: number };

function sameRect(a: Rect | null, b: Rect) {
  return (
    a !== null &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

function Frame({
  anchor,
  container,
  variant,
}: {
  anchor: HTMLElement | null;
  container: HTMLElement;
  variant: 'hover' | 'selected';
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  // Deliberately no dependency array. Opening a side pane re-zooms and re-centres
  // the pages, which moves the anchor without resizing it — ResizeObserver never
  // sees that, and the zoom lands a frame after the observer would have fired.
  // Measuring after every render is what keeps the frame on its element; the
  // value comparison below stops that from looping.
  useLayoutEffect(() => {
    if (!anchor?.isConnected) {
      setRect(null);
      return;
    }
    // The overlay is absolutely positioned inside the scroller, so its origin
    // is the content box — frames live in content coordinates and scroll along
    // with the pages.
    const measure = () => {
      const a = anchor.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      const next = {
        left: a.left - c.left + container.scrollLeft,
        top: a.top - c.top + container.scrollTop,
        width: a.width,
        height: a.height,
      };
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(anchor);
    ro.observe(container);
    container.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      container.removeEventListener('scroll', measure);
    };
  });

  if (!rect) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute rounded-[2px]"
      style={{ ...rect, ...FRAME_STYLE[variant] }}
    />
  );
}

type Props = {
  docId: string;
  /** The scroll container the pages live in. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  onExit: () => void;
};

export function Inspector({ docId, containerRef, onExit }: Props) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [hover, setHover] = useState<InspectorTarget | null>(null);
  const [selected, setSelected] = useState<InspectorTarget | null>(null);
  const [target, setTarget] = useState<ResolvedTarget | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => setContainer(containerRef.current), [containerRef]);

  const insidePanel = useCallback(
    (node: EventTarget | null) => panelRef.current?.contains(node as Node) ?? false,
    [],
  );

  useEffect(() => {
    if (!container) return;

    const onMove = (e: PointerEvent) => {
      if (insidePanel(e.target)) return;
      setHover(targetFrom(e.target as Element));
    };
    const onClick = (e: MouseEvent) => {
      if (insidePanel(e.target)) return;
      const target = targetFrom(e.target as Element);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      setSelected(target);
      setStatus(null);
      setNote('');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selected) {
        setSelected(null);
        return;
      }
      onExit();
    };

    container.addEventListener('pointermove', onMove, true);
    container.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      container.removeEventListener('pointermove', onMove, true);
      container.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [container, insidePanel, onExit, selected]);

  // Report the pick to the dev server so `current.json` can answer "this
  // element" for an agent. Clearing the selection clears it there too.
  useEffect(() => {
    if (!import.meta.hot) return;
    import.meta.hot.send('open-doc:current', {
      selection: selected
        ? {
            line: selected.line,
            column: selected.column,
            tagName: selected.anchor.tagName.toLowerCase(),
            text: normalize(selected.anchor.textContent ?? '').slice(0, 120),
          }
        : null,
    });
  }, [selected]);

  // Read the element's text from source, not from the DOM: only source can say
  // whether it is a single editable text child or markup we must not touch.
  useEffect(() => {
    if (!selected) {
      setTarget(null);
      setDrafts({});
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      docId,
      locs: formatLocs(candidateLocs(selected.anchor)),
      shown: normalize(selected.anchor.textContent ?? '').slice(0, 400),
    });
    fetch(`/__edit/text?${params}`)
      .then((res) => res.json())
      .then((body: ResolvedTarget & { error?: string }) => {
        if (cancelled) return;
        if (body.error) {
          setTarget(null);
          setStatus(body.error);
          return;
        }
        // Last line of defence: every run the source offers has to be visible
        // in the element the user clicked. A drifted resolution would
        // otherwise let a save rewrite someone else's words.
        const shownText = normalize(selected.anchor.textContent ?? '');
        const runs = (body.parts ?? []).filter((part) => part.kind === 'text');
        const belongs =
          runs.length > 0 &&
          runs.every((part) => part.kind === 'text' && shownText.includes(normalize(part.value)));
        setTarget(
          body.editable && !belongs
            ? { ...body, editable: false, reason: 'source text does not match this element' }
            : body,
        );
        setDrafts({});
      })
      .catch(() => {
        if (!cancelled) setStatus('could not read source');
      });
    return () => {
      cancelled = true;
    };
  }, [selected, docId]);

  const textParts = (target?.parts ?? []).filter(
    (part): part is Extract<TextPart, { kind: 'text' }> => part.kind === 'text',
  );
  const dirty = textParts.filter(
    (part) => drafts[part.index] !== undefined && drafts[part.index] !== part.value,
  );

  const saveText = async () => {
    if (!target || dirty.length === 0 || busy) return;
    setBusy(true);
    try {
      for (const part of dirty) {
        const res = await fetch('/__edit/text', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            docId,
            line: target.line,
            column: target.column,
            index: part.index,
            expected: part.value,
            text: drafts[part.index],
          }),
        });
        const body = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !body.ok) {
          setStatus(body.error ?? 'Save failed');
          return;
        }
      }
      setStatus('Saved to source');
      // Editing shifts what follows, so the captured location is good for one
      // write. Reselect to edit again.
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  const saveComment = async () => {
    if (!selected || note.trim() === '' || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/__edit/comment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          docId,
          line: target?.line ?? selected.line,
          column: target?.column ?? selected.column,
          note,
          hint: selected.tag,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setNote('');
        setStatus('Marked in source — run /apply-comments');
      } else {
        setStatus(body.error ?? 'Could not add comment');
      }
    } finally {
      setBusy(false);
    }
  };

  const overlay = container
    ? createPortal(
        <>
          <div className="pointer-events-none absolute inset-0 z-30">
            <Frame
              anchor={hover?.anchor === selected?.anchor ? null : (hover?.anchor ?? null)}
              container={container}
              variant="hover"
            />
            <Frame anchor={selected?.anchor ?? null} container={container} variant="selected" />
          </div>
          <div className="pointer-events-none sticky bottom-3 z-40 mx-auto w-fit rounded-full bg-foreground/90 px-3 py-1.5 text-[11px] text-background">
            {selected ? 'Esc to deselect' : 'Click an element · Esc to exit'}
          </div>
        </>,
        container,
      )
    : null;

  return (
    <>
      {overlay}
      {selected && (
        <aside
          ref={panelRef}
          className="flex w-72 flex-none flex-col border-border border-l bg-background"
        >
          <header className="flex h-10 flex-none items-center justify-between border-border border-b px-3">
            <span className="font-mono text-[11px] text-muted-foreground">
              &lt;{selected.tag}&gt; · {target?.line ?? selected.line}:
              {target?.column ?? selected.column}
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setSelected(null)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <span className="block text-[10px] text-muted-foreground uppercase tracking-wider">
              Text
            </span>
            {target === null ? (
              <div className="grid h-16 place-items-center">
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              </div>
            ) : target.editable ? (
              <>
                <div className="mt-1 space-y-1.5">
                  {target.parts.map((part, index) =>
                    part.kind === 'markup' ? (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
                        key={`m${index}`}
                        className="rounded border border-border border-dashed px-2 py-1 font-mono text-[10px] text-muted-foreground"
                        title="Markup is kept as written"
                      >
                        {part.label}
                      </div>
                    ) : (
                      <textarea
                        key={`t${part.index}`}
                        value={drafts[part.index] ?? part.value}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [part.index]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveText();
                        }}
                        rows={Math.min(
                          6,
                          Math.ceil((drafts[part.index] ?? part.value).length / 28) + 1,
                        )}
                        className="w-full resize-y rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-foreground/40"
                      />
                    ),
                  )}
                </div>
                <button
                  type="button"
                  onClick={saveText}
                  disabled={busy || dirty.length === 0}
                  className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded bg-primary px-2 py-1.5 text-primary-foreground text-xs disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  {dirty.length > 1 ? `Save ${dirty.length} edits` : 'Save text'}
                </button>
              </>
            ) : (
              <p className="mt-1 rounded border border-border bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                {target.reason ?? 'Not editable here.'}
              </p>
            )}

            <span className="mt-4 block text-[10px] text-muted-foreground uppercase tracking-wider">
              Comment for the agent
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveComment();
              }}
              rows={3}
              placeholder="make this bold, shorten to one line…"
              className="mt-1 w-full resize-y rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
            />
            <button
              type="button"
              onClick={saveComment}
              disabled={busy || note.trim() === ''}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded border border-border px-2 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
            >
              <MessageSquarePlus className="size-3" />
              Mark comment
            </button>

            {status && <p className="mt-2 text-[11px] text-muted-foreground">{status}</p>}
          </div>
        </aside>
      )}
    </>
  );
}
