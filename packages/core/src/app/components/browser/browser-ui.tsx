import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The pieces every page of the document browser shares — Documents, a folder,
 * Themes, Assets — so they line up with each other: one header, one empty
 * state, one card width. The shell supplies the page padding; nothing here
 * adds its own.
 */

/** Every card in the browser is this wide, so a document, a theme and an asset line up. */
export const CARD_WIDTH = 180;

export const CARD_GRID =
  'grid justify-start gap-x-8 gap-y-9 [grid-template-columns:repeat(auto-fill,180px)]';

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Page-level actions, at the right of the title. */
  actions?: ReactNode;
  /** Controls that belong to the header, below the description. */
  children?: ReactNode;
}) {
  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-medium text-lg tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border border-dashed px-6 py-14 text-center">
      <Icon className="mx-auto size-6 text-muted-foreground" />
      <p className="mt-3 font-medium text-sm">{title}</p>
      {children && <p className="mt-1 text-muted-foreground text-xs">{children}</p>}
    </div>
  );
}

/** The two lines under a card's picture: a name that may wrap once, and one quiet line of facts. */
export function CardText({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="line-clamp-2 font-medium text-sm leading-snug">{title}</p>
      {meta && <p className="mt-1 truncate text-muted-foreground text-xs">{meta}</p>}
    </div>
  );
}
