/**
 * A short notice in the corner of the window — the few the agent panel raises
 * when something it started from a click fails or finishes. Drawn straight into
 * the DOM rather than through a toast library, since the runtime ships to
 * users; the call shape matches `sonner`'s so the panel reads the same.
 */

type Kind = 'error' | 'success';
type Options = { description?: string };

const SHOWN_MS = 5000;

function host(): HTMLElement {
  let el = document.getElementById('od-toasts');
  if (!el) {
    el = document.createElement('div');
    el.id = 'od-toasts';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.className =
      'pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2';
    document.body.append(el);
  }
  return el;
}

function show(kind: Kind, message: string, options?: Options): void {
  if (typeof document === 'undefined') return;
  const card = document.createElement('div');
  card.className =
    'island-enter pointer-events-auto rounded-[8px] border border-hairline bg-popover px-3 py-2.5 text-[12.5px] text-popover-foreground shadow-floating';
  card.dataset.kind = kind;
  const title = document.createElement('p');
  title.className = kind === 'error' ? 'font-medium text-destructive' : 'font-medium';
  title.textContent = message;
  card.append(title);
  if (options?.description) {
    const body = document.createElement('p');
    body.className = 'mt-0.5 break-words text-[11.5px] text-muted-foreground';
    body.textContent = options.description;
    card.append(body);
  }
  host().append(card);
  setTimeout(() => card.remove(), SHOWN_MS);
}

export const toast = {
  error: (message: string, options?: Options) => show('error', message, options),
  success: (message: string, options?: Options) => show('success', message, options),
};
