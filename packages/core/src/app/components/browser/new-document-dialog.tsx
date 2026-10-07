import {
  Award,
  FileText,
  type LucideIcon,
  Mail,
  NotebookPen,
  Presentation,
  Square,
  Users,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TemplateSummary } from '../../../ops/templates';
import { useT } from '../../lib/i18n';

const ICONS: Record<string, LucideIcon> = {
  blank: Square,
  report: FileText,
  proposal: Presentation,
  'meeting-notes': Users,
  letter: Mail,
  certificate: Award,
};

const iconOf = (template: TemplateSummary) => ICONS[template.name] ?? NotebookPen;

/**
 * Starting a document: the templates as cards, each with the name the CLI and
 * an agent use for it, and a title. A native modal dialog, so focus is trapped
 * while it is open and goes back to the button that opened it.
 */
export function NewDocumentDialog({
  open,
  folderId,
  onClose,
}: {
  open: boolean;
  /** The folder being viewed, which the new document is filed into. */
  folderId: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [chosen, setChosen] = useState('blank');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTitle('');
    let cancelled = false;
    fetch('/__templates')
      .then((res) => res.json())
      .then((body: { templates?: TemplateSummary[] }) => {
        if (cancelled) return;
        const list = body.templates ?? [];
        setTemplates(list);
        setChosen((current) =>
          list.some((entry) => entry.name === current) ? current : (list[0]?.name ?? 'blank'),
        );
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/__templates/${encodeURIComponent(chosen)}/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(folderId ? { folderId } : {}),
        }),
      });
      const body = (await res.json()) as { docId?: string; error?: string };
      if (!res.ok || !body.docId) {
        setError(body.error ?? t('Could not create the document'));
        return;
      }
      onClose();
      navigate(`/d/${body.docId}`);
    } catch {
      setError(t('Could not create the document'));
    } finally {
      setBusy(false);
    }
  };

  const selected = templates?.find((entry) => entry.name === chosen);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="new-document-title"
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[min(720px,calc(100vw-32px))] rounded-xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <form onSubmit={create} className="flex max-h-[min(640px,calc(100vh-64px))] flex-col">
        <header className="flex h-12 flex-none items-center justify-between border-border border-b px-4">
          <h2 id="new-document-title" className="font-medium text-sm">
            {t('New document')}
          </h2>
          <button
            type="button"
            aria-label={t('Close')}
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/60"
          >
            <X className="size-4" />
          </button>
        </header>

        <fieldset className="m-0 min-h-0 flex-1 overflow-y-auto border-0 p-4">
          <legend className="sr-only">{t('Template')}</legend>
          {templates === null ? (
            <div className="h-0.5 overflow-hidden rounded bg-muted">
              <div className="h-full w-1/3 animate-pulse bg-foreground/20" />
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
              {templates.map((template) => {
                const Icon = iconOf(template);
                return (
                  <label
                    key={template.name}
                    className="flex cursor-pointer flex-col gap-1.5 rounded-lg border border-border p-3 transition-colors hover:bg-accent/50 has-[:checked]:border-foreground/60 has-[:checked]:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-foreground/60"
                  >
                    <input
                      type="radio"
                      name="template"
                      value={template.name}
                      checked={chosen === template.name}
                      onChange={() => setChosen(template.name)}
                      className="sr-only"
                    />
                    <span className="flex items-center gap-2">
                      <Icon aria-hidden className="size-4 text-muted-foreground" />
                      <span className="flex-1 font-medium text-xs">{t(template.title)}</span>
                      {template.source === 'workspace' && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {t('This workspace')}
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-2 text-[11px] text-muted-foreground leading-snug">
                      {template.description}
                    </span>
                    <code className="font-mono text-[10px] text-muted-foreground/80">
                      {template.name}
                    </code>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <footer className="flex flex-none flex-col gap-2 border-border border-t p-4">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={selected ? t(selected.title) : t('Title')}
              aria-label={t('Title')}
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-foreground/40"
            />
            <button
              type="submit"
              disabled={busy || templates === null}
              className="h-9 rounded-md bg-primary px-4 text-primary-foreground text-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/60 disabled:opacity-60"
            >
              {t('Create')}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs" style={{ color: 'var(--change-removed)' }}>
              {error}
            </p>
          )}
        </footer>
      </form>
    </dialog>
  );
}
