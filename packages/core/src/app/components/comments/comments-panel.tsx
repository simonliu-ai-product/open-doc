import { Check, ClipboardCopy, Crosshair, MessageSquare, MessageSquarePlus, X } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useT } from '../../lib/i18n';
import { PanelIconButton, PanelShell } from '../panel/panel-shell';
import type { CommentsState, DocComment } from './use-comments';

/** The number a comment wears on the page and in the list, so the two can be matched by eye. */
export function Pin({ n, active = false }: { n: number; active?: boolean }) {
  return (
    <span
      className={`flex size-5 flex-none items-center justify-center rounded-full font-mono font-semibold text-[10px] text-white tabular-nums ${
        active ? 'ring-2 ring-offset-1 ring-offset-background' : ''
      }`}
      style={{
        background: 'var(--comment-pin)',
        ['--tw-ring-color' as string]: 'var(--comment-pin)',
      }}
    >
      {n}
    </span>
  );
}

function Card({
  comment,
  n,
  page,
  excerpt,
  active,
  onSelect,
  onResolve,
}: {
  comment: DocComment;
  n: number;
  page: number | undefined;
  excerpt: string;
  active: boolean;
  onSelect: () => void;
  onResolve: () => Promise<string | null>;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const when = new Date(comment.ts);
  return (
    <li className="relative">
      <button
        type="button"
        aria-current={active || undefined}
        onClick={onSelect}
        className="flex w-full gap-2.5 rounded-md py-2.5 pr-10 pl-2 text-left transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-foreground/60 aria-[current]:bg-accent"
      >
        <Pin n={n} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="whitespace-pre-wrap break-words text-xs leading-snug">
            {comment.note}
          </span>
          {excerpt && (
            <span className="truncate border-border border-l-2 pl-1.5 text-[11px] text-muted-foreground">
              {excerpt}
            </span>
          )}
          <span className="font-mono text-[10px] text-muted-foreground/80 tabular-nums">
            {[
              page ? t('p.{page}', { page }) : null,
              Number.isNaN(when.getTime())
                ? null
                : when.toLocaleString(locale, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={t('Resolve')}
        title={t('Resolve')}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(await onResolve());
          setBusy(false);
        }}
        className="absolute top-1.5 right-1 flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/60 disabled:opacity-50"
      >
        <Check className="size-3.5" />
      </button>
      {error && (
        <p
          role="alert"
          className="px-3 pb-2 text-[11px]"
          style={{ color: 'var(--change-removed)' }}
        >
          {t(error)}
        </p>
      )}
    </li>
  );
}

/**
 * Starting a comment, and the state it leaves the page in: pressed while the
 * page waits for an element, pressed again to stop.
 */
function PickButton({ picking, onClick }: { picking: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      aria-pressed={picking}
      onClick={onClick}
      className="flex h-8 w-full items-center justify-center gap-1.5 rounded border border-border px-3 text-foreground text-xs transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-foreground/60 aria-pressed:border-[var(--comment-pin)] aria-pressed:bg-accent"
    >
      {picking ? (
        <>
          <Crosshair className="size-3.5" style={{ color: 'var(--comment-pin)' }} />
          {t('Pick an element on the page')}
          <kbd className="ml-1 rounded bg-foreground/10 px-1 font-mono text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </>
      ) : (
        <>
          <MessageSquarePlus className="size-3.5" />
          {t('New comment')}
        </>
      )}
    </button>
  );
}

export type CommentsPanelProps = {
  docId: string;
  state: CommentsState;
  placement: Map<string, number[]>;
  /** The words of the element each comment is about, by comment id. */
  excerpts: Map<string, string>;
  activeId: string | null;
  onSelect: (comment: DocComment) => void;
  onResolve: (comment: DocComment) => Promise<string | null>;
  /** Pick an element on the page to comment on; again to stop. */
  onNew: () => void;
  /** Waiting for that element. */
  picking: boolean;
  onClose: () => void;
};

/**
 * The review notes on this document, numbered as they are pinned on the
 * page. Resolving one takes its marker out of the source; handing them to the
 * agent is one copied request, and what the agent changes shows up under
 * Changes.
 */
export function CommentsPanel({
  docId,
  state,
  placement,
  excerpts,
  activeId,
  onSelect,
  onResolve,
  onNew,
  picking,
  onClose,
}: CommentsPanelProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const comments = state.status === 'ready' ? state.comments : [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`/apply-comments docs/${docId}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <PanelShell
      label={t('Comments')}
      header={
        <>
          <MessageSquare aria-hidden className="size-3.5 flex-none text-muted-foreground" />
          <span className="truncate font-medium text-xs">{t('Comments')}</span>
          {comments.length > 0 && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
              {comments.length}
            </span>
          )}
        </>
      }
      actions={
        <>
          <button
            type="button"
            aria-label={t('New comment')}
            title={t('New comment')}
            aria-pressed={picking}
            onClick={onNew}
            className="flex size-8 items-center justify-center rounded text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/60 aria-pressed:bg-accent aria-pressed:text-foreground"
          >
            <MessageSquarePlus className="size-3.5" />
          </button>
          <PanelIconButton label={t('Close')} onClick={onClose}>
            <X className="size-3.5" />
          </PanelIconButton>
        </>
      }
      banner={
        picking ? (
          <div className="border-border border-b px-3 py-2">
            <PickButton picking onClick={onNew} />
          </div>
        ) : (
          comments.length > 0 && (
            <div className="border-border border-b px-3 py-2">
              <button
                type="button"
                onClick={copy}
                title="/apply-comments"
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded border border-border text-xs transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-foreground/60"
              >
                {copied ? (
                  <Check className="size-3.5" style={{ color: 'var(--change-added)' }} />
                ) : (
                  <ClipboardCopy className="size-3.5" />
                )}
                {copied ? t('Copied') : t('Copy request for the agent')}
              </button>
            </div>
          )
        )
      }
    >
      {state.status === 'loading' ? (
        <div className="m-3 h-0.5 overflow-hidden rounded bg-muted">
          <div className="h-full w-1/3 animate-pulse bg-foreground/20" />
        </div>
      ) : state.status === 'error' ? (
        <p className="px-6 py-12 text-center text-muted-foreground text-xs">{state.error}</p>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-muted-foreground text-xs">
          <MessageSquare className="size-5" />
          {t('No comments')}
          {!picking && <PickButton picking={false} onClick={onNew} />}
        </div>
      ) : (
        <ul className="flex flex-col p-2">
          {comments.map((comment, at) => (
            <Card
              key={comment.id}
              comment={comment}
              n={at + 1}
              page={placement.get(comment.id)?.[0]}
              excerpt={excerpts.get(comment.id) ?? ''}
              active={comment.id === activeId}
              onSelect={() => onSelect(comment)}
              onResolve={() => onResolve(comment)}
            />
          ))}
        </ul>
      )}
    </PanelShell>
  );
}
