import { Check, Loader2, Redo2, Save, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';

const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const UNDO_KEYS = IS_APPLE ? '⌘Z' : 'Ctrl+Z';
const REDO_KEYS = IS_APPLE ? '⇧⌘Z' : 'Ctrl+Y';
const SAVE_KEYS = IS_APPLE ? '⌘S' : 'Ctrl+S';

/**
 * The one place that says what is unsaved in the document view — text edited
 * on the page and design tokens alike — with undo and redo beside it. Both
 * previews make the page *look* saved; without this, closing the tab would
 * quietly lose them.
 */
export function SaveCard({
  count,
  committing,
  error,
  canUndo,
  canRedo,
  onSave,
  onDiscard,
  onUndo,
  onRedo,
}: {
  count: number;
  committing: boolean;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Resolves true when everything was written. */
  onSave: () => Promise<boolean>;
  onDiscard: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const t = useT();
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 1200);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const dirty = count > 0;
  if (!(dirty || committing || justSaved || canUndo || canRedo || error)) return null;

  const save = async () => {
    if (await onSave()) setJustSaved(true);
  };

  return (
    <div
      role="toolbar"
      aria-label={t('Unsaved changes')}
      className="od-card-in pointer-events-auto absolute bottom-4 left-1/2 z-40 flex h-10 -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-background py-1 pr-1 pl-1 text-xs shadow-md"
    >
      <HistoryButton
        label={t('Undo')}
        keys={UNDO_KEYS}
        disabled={committing || !canUndo}
        onClick={onUndo}
      >
        <Undo2 className="size-3.5" />
      </HistoryButton>
      <HistoryButton
        label={t('Redo')}
        keys={REDO_KEYS}
        disabled={committing || !canRedo}
        onClick={onRedo}
      >
        <Redo2 className="size-3.5" />
      </HistoryButton>
      {(justSaved || dirty || committing || error) && (
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
      )}
      <span role="status" className="flex items-center gap-1.5 whitespace-nowrap px-1.5">
        {justSaved ? (
          <>
            <Check className="size-3.5 flex-none" strokeWidth={2.5} />
            {t('Saved')}
          </>
        ) : error ? (
          <span className="max-w-72 truncate text-muted-foreground" title={error}>
            {error}
          </span>
        ) : dirty || committing ? (
          <>
            <span aria-hidden className="size-1.5 flex-none rounded-full bg-foreground" />
            <span className="tabular-nums">
              {count === 1
                ? t('{count} unsaved change', { count })
                : t('{count} unsaved changes', { count })}
            </span>
          </>
        ) : null}
      </span>
      {!justSaved && dirty && (
        <button
          type="button"
          onClick={onDiscard}
          disabled={committing}
          className="h-8 rounded-md px-3 text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/60 focus-visible:outline-offset-1 disabled:opacity-50"
        >
          {t('Discard')}
        </button>
      )}
      {(dirty || committing) && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={committing}
          title={`${t('Save')} (${SAVE_KEYS})`}
          className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-foreground/60 focus-visible:outline-offset-1 disabled:opacity-70"
        >
          {committing ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save className="size-3.5" />
          )}
          {committing ? t('Saving') : t('Save')}
        </button>
      )}
    </div>
  );
}

function HistoryButton({
  label,
  keys,
  disabled,
  onClick,
  children,
}: {
  label: string;
  keys: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (${keys})`}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md text-foreground/75 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/60 focus-visible:outline-offset-1 disabled:text-foreground/30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
