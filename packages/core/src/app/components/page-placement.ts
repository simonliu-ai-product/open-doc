import { useEffect, useState } from 'react';
import { EDITING_ATTR } from '../lib/inspector/inline-edit';
import { PAGE_INDEX_ATTR } from '../lib/outline';
import { PROP_ATTR } from '../lib/source-loc';

/**
 * The elements on the sheets printed from one source location. Thumbnails,
 * the inspector's editing clone and words a component prints from a prop all
 * carry a loc too, and none of them is the element itself.
 */
export function elementsAtLoc(container: ParentNode, loc: string): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      `[data-od-loc="${loc}"]:not([${PROP_ATTR}]):not([${EDITING_ATTR}])`,
    ),
  ];
}

function pageOf(el: HTMLElement): number | null {
  const raw = el.closest(`[${PAGE_INDEX_ATTR}]`)?.getAttribute(PAGE_INDEX_ATTR);
  return raw == null ? null : Number(raw) + 1;
}

export type Placeable = { id: string; locs: string[] };

/**
 * Which pages each thing lands on, read from the rendered sheets — a change,
 * a comment. It is read again whenever the sheets change: a flow section
 * repaginating moves it to another page without anything else telling us.
 */
export function usePlacement(
  container: HTMLElement | null,
  targets: Placeable[],
): Map<string, number[]> {
  const [placement, setPlacement] = useState<Map<string, number[]>>(new Map());
  useEffect(() => {
    if (!container) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = new Map<string, number[]>();
        for (const target of targets) {
          const pages = [
            ...new Set(
              target.locs
                .flatMap((loc) => elementsAtLoc(container, loc))
                .map(pageOf)
                .filter((page): page is number => page !== null),
            ),
          ].sort((a, b) => a - b);
          next.set(target.id, pages);
        }
        setPlacement((prev) =>
          JSON.stringify([...prev]) === JSON.stringify([...next]) ? prev : next,
        );
      });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(container, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [container, targets]);
  return placement;
}
