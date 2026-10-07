import type { LucideIcon } from 'lucide-react';
import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react';

/**
 * The pieces every page of the document browser shares — Documents, a folder,
 * Themes, Assets — so they line up with each other: one header, one empty
 * state, one card width. The shell supplies the page padding; nothing here
 * adds its own.
 */

/** The narrowest a card gets; columns share whatever width is left over. */
export const CARD_WIDTH = 200;

export const CARD_GRID =
  'grid gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]';

/**
 * A card's picture is a real page scaled down, and the scale is a number, so the
 * card has to know how wide its column came out. Starts at the narrowest width
 * so the first paint already has the right shape.
 */
/** Every card's preview box: a portrait A4, the sheet most documents print on. */
const FRAME_RATIO = 297 / 210;

/**
 * How a sheet sits in a card's preview box. The box is the same for every
 * card, so titles line up along a row; the sheet is scaled to fit inside it
 * whole and centred — a landscape page is letterboxed on the canvas colour,
 * never cropped, since a preview that hides part of the page misreports it.
 */
export function fitInCard(
  cardWidth: number,
  sheet: { width: number; height: number },
): { frameHeight: number; scale: number } {
  const frameHeight = cardWidth * FRAME_RATIO;
  const scale =
    sheet.width > 0 && sheet.height > 0
      ? Math.min(cardWidth / sheet.width, frameHeight / sheet.height)
      : 0;
  return { frameHeight, scale };
}

export function useCardWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(CARD_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(1, Math.floor(el.getBoundingClientRect().width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function PageHeader({
  title,
  icon: Icon,
  count,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  /** How many things the page lists, beside the title. */
  count?: number;
  description?: ReactNode;
  /** Page-level actions, at the right of the title. */
  actions?: ReactNode;
  /** Controls that belong to the header, below the description. */
  children?: ReactNode;
}) {
  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 font-medium text-lg tracking-tight">
            {Icon && <Icon className="size-4.5 text-muted-foreground" aria-hidden />}
            <span className="truncate">{title}</span>
            {count !== undefined && (
              <span className="font-mono font-normal text-muted-foreground text-xs tabular-nums">
                {String(count).padStart(2, '0')}
              </span>
            )}
          </h1>
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
