import type { ReactNode } from 'react';

/**
 * The right-hand dock's chrome, shared by the design panel and the element
 * panel so switching between them changes the content, not the frame. The dock
 * does not animate its width — that would reflow the pages on every frame —
 * so only the content fades in, from the edge it docks against.
 */
export function PanelShell({
  label,
  header,
  actions,
  banner,
  children,
  panelRef,
}: {
  /** The accessible name of the region. */
  label: string;
  header: ReactNode;
  actions?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  panelRef?: React.Ref<HTMLElement>;
}) {
  return (
    <aside
      ref={panelRef}
      aria-label={label}
      className="od-panel-in flex w-72 flex-none flex-col border-border border-l bg-background"
    >
      <header className="flex h-10 flex-none items-center justify-between gap-2 border-border border-b px-3">
        <div className="flex min-w-0 items-center gap-2">{header}</div>
        {actions && <div className="flex flex-none items-center gap-0.5">{actions}</div>}
      </header>
      {banner}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

export function PanelIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/60 focus-visible:outline-offset-1"
    >
      {children}
    </button>
  );
}

/** A quiet line under the header: something about the panel as a whole. */
export function PanelBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 border-border border-b bg-muted px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
      <span aria-hidden className="mt-1.5 size-1.5 flex-none rounded-full bg-foreground/40" />
      <span>{children}</span>
    </div>
  );
}
