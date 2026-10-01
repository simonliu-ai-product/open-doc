import { CornerDownLeft, type LucideIcon, Search } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useT } from '../lib/i18n';
import { cn } from '../lib/utils';

export type PaletteItem = {
  id: string;
  group: string;
  label: string;
  /** Quiet text at the right of the row — a page number, a shortcut. */
  hint?: string;
  icon?: LucideIcon;
  /** More words the query may match than the label shows. */
  keywords?: string;
  /** Ranks first whenever it matches — the one answer the query was typed to get. */
  pinned?: boolean;
  run: () => void;
};

type PaletteApi = { open: () => void };

const PaletteContext = createContext<PaletteApi>({ open: () => {} });

/** Opens the palette from anywhere below it — the sidebar's search field, a toolbar button. */
export function useCommandPalette(): PaletteApi {
  return useContext(PaletteContext);
}

export const PALETTE_SHORTCUT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

function matches(item: PaletteItem, words: string[]): number {
  const label = item.label.toLowerCase();
  const haystack = `${label} ${item.keywords?.toLowerCase() ?? ''} ${item.group.toLowerCase()}`;
  if (!words.every((word) => haystack.includes(word))) return -1;
  if (item.pinned) return 3;
  // A label that starts with what was typed outranks one that merely contains it.
  return label.startsWith(words[0] ?? '') ? 2 : label.includes(words[0] ?? '') ? 1 : 0;
}

/**
 * ⌘K: one field that reaches every document, theme, folder and action without
 * leaving the keyboard. Built here rather than pulled in — `core` ships to every
 * user, and a dialog with a listbox is a page of code, not a dependency.
 *
 * `items` may be computed from the query (the viewer offers "Go to page 12"
 * when 12 is typed), so it is a function of it.
 */
export function CommandPaletteProvider({
  items,
  placeholder,
  children,
}: {
  items: (query: string) => PaletteItem[];
  placeholder?: string;
  children: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);
  const listId = useId();

  const show = useCallback(() => {
    returnRef.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setActive(0);
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    // Focus goes back where it came from, so closing never strands the reader.
    requestAnimationFrame(() => returnRef.current?.focus?.());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      // ⌘K inside text being edited on the page is "add a link", not search.
      const target = event.target as HTMLElement | null;
      if (target?.closest('[contenteditable="true"], [data-od-editing]')) return;
      event.preventDefault();
      if (open) hide();
      else show();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, show, hide]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const results = useMemo(() => {
    if (!open) return [];
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const all = items(query.trim());
    if (words.length === 0) return all;
    return all
      .map((item, order) => ({ item, order, score: matches(item, words) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .map((entry) => entry.item);
  }, [open, query, items]);

  useEffect(() => {
    setActive((index) => Math.min(index, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    setOpen(false);
    item.run();
  };

  const groups: Array<{ name: string; entries: Array<{ item: PaletteItem; index: number }> }> = [];
  results.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.entries.push({ item, index });
    else groups.push({ name: item.group, entries: [{ item, index }] });
  });

  const api = useMemo(() => ({ open: show }), [show]);

  return (
    <PaletteContext.Provider value={api}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]">
          <button
            type="button"
            aria-label={t('Close')}
            tabIndex={-1}
            onClick={hide}
            className="od-fade-in absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('Command menu')}
            className="od-fade-in relative flex max-h-[min(70vh,520px)] w-full max-w-[560px] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
          >
            <div className="flex items-center gap-2 border-border border-b px-3">
              <Search className="size-4 flex-none text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActive((index) => (results.length ? (index + 1) % results.length : 0));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActive((index) =>
                      results.length ? (index - 1 + results.length) % results.length : 0,
                    );
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    run(results[active]);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    hide();
                  } else if (event.key === 'Tab') {
                    // The field is the dialog's only stop; Tab must not walk out of it.
                    event.preventDefault();
                  }
                }}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
                aria-autocomplete="list"
                placeholder={placeholder ?? t('Search documents, sections and actions')}
                className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div
              id={listId}
              role="listbox"
              aria-label={t('Results')}
              className="overflow-y-auto p-1.5"
            >
              {results.length === 0 && (
                <p className="px-3 py-8 text-center text-muted-foreground text-sm">
                  {t('Nothing matches “{query}”.', { query: query.trim() })}
                </p>
              )}
              {groups.map((group) => (
                // biome-ignore lint/a11y/useSemanticElements: a listbox's groups are role="group" by definition; a fieldset has no meaning inside one
                <div key={group.name} role="group" aria-label={group.name}>
                  <p
                    aria-hidden
                    className="px-2.5 pt-2 pb-1 text-[10px] text-muted-foreground uppercase tracking-wide"
                  >
                    {group.name}
                  </p>
                  {group.entries.map(({ item, index }) => {
                    const Icon = item.icon;
                    const selected = index === active;
                    return (
                      // biome-ignore lint/a11y/useFocusableInteractive: options are reached with the arrow keys from the combobox, which keeps focus — the listbox pattern
                      <div
                        key={item.id}
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => setActive(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => run(item)}
                        onKeyDown={() => {}}
                        className={cn(
                          'flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm',
                          selected ? 'bg-accent text-foreground' : 'text-foreground/90',
                        )}
                      >
                        {Icon && <Icon className="size-4 flex-none text-muted-foreground" />}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.hint && (
                          <span className="flex-none font-mono text-[11px] text-muted-foreground">
                            {item.hint}
                          </span>
                        )}
                        {selected && (
                          <CornerDownLeft className="size-3.5 flex-none text-muted-foreground" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-border border-t px-3 py-2 text-[11px] text-muted-foreground">
              <span>
                <Kbd>esc</Kbd> {t('Close')}
              </span>
              <span className="flex items-center gap-3">
                <span>
                  <Kbd>↑</Kbd> <Kbd>↓</Kbd> {t('Navigate')}
                </span>
                <span>
                  <Kbd>↵</Kbd> {t('Open')}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </PaletteContext.Provider>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}
