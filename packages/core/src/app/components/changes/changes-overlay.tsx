import { type CSSProperties, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChangeMark } from '../../../ops/changes-diff';
import { EDITING_ATTR } from '../../lib/inspector/inline-edit';
import { PAGE_INDEX_ATTR } from '../../lib/outline';
import { PROP_ATTR } from '../../lib/source-loc';
import { OverlayFrame } from '../overlay-frame';
import type { ChangeItem } from './use-changes';

/** Every element on the page that one change touches, with how it is marked. */
export function elementsOf(
  container: ParentNode,
  item: ChangeItem,
): Array<{ el: HTMLElement; mark: ChangeMark }> {
  return item.hunk.targets.flatMap((target) =>
    [
      ...container.querySelectorAll<HTMLElement>(
        `[data-od-loc="${target.loc}"]:not([${PROP_ATTR}]):not([${EDITING_ATTR}])`,
      ),
    ].map((el) => ({ el, mark: target.mark })),
  );
}

function pageOf(el: HTMLElement): number | null {
  const raw = el.closest(`[${PAGE_INDEX_ATTR}]`)?.getAttribute(PAGE_INDEX_ATTR);
  return raw == null ? null : Number(raw) + 1;
}

/**
 * Which pages each change lands on, read from the rendered sheets. It is read
 * again whenever the sheets change — a flow section repaginating moves a
 * change to another page without anything else telling us.
 */
export function usePlacement(
  container: HTMLElement | null,
  items: ChangeItem[],
): Map<string, number[]> {
  const [placement, setPlacement] = useState<Map<string, number[]>>(new Map());
  useEffect(() => {
    if (!container) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = new Map<string, number[]>();
        for (const item of items) {
          const pages = [
            ...new Set(
              elementsOf(container, item)
                .map(({ el }) => pageOf(el))
                .filter((page): page is number => page !== null),
            ),
          ].sort((a, b) => a - b);
          next.set(item.hunk.id, pages);
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
  }, [container, items]);
  return placement;
}

const COLOR: Record<ChangeMark, string> = {
  added: 'var(--change-added)',
  changed: 'var(--change-changed)',
  'removed-before': 'var(--change-removed)',
  'removed-after': 'var(--change-removed)',
};

function markStyle(mark: ChangeMark, active: boolean): CSSProperties {
  const color = COLOR[mark];
  // Something taken out has no box of its own: a bar where it used to be.
  if (mark === 'removed-before' || mark === 'removed-after') {
    return {
      [mark === 'removed-before' ? 'borderTop' : 'borderBottom']:
        `${active ? 3 : 2}px dashed ${color}`,
      transform: `translateY(${mark === 'removed-before' ? -5 : 5}px)`,
    };
  }
  return {
    outline: `${active ? 2 : 1.5}px solid ${color}`,
    outlineOffset: active ? 3 : 2,
    background: `color-mix(in oklch, ${color} ${active ? 14 : 8}%, transparent)`,
  };
}

/** The changes drawn onto the sheets: a box for what is new or rewritten, a bar where something went. */
export function ChangesOverlay({
  container,
  items,
  activeId,
}: {
  container: HTMLElement;
  items: ChangeItem[];
  activeId: string | null;
}) {
  return createPortal(
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      {items.flatMap((item) =>
        elementsOf(container, item).map(({ el, mark }, at) => (
          <OverlayFrame
            // biome-ignore lint/suspicious/noArrayIndexKey: one hunk can print the same loc twice
            key={`${item.hunk.id}:${at}`}
            anchor={el}
            container={container}
            style={markStyle(mark, item.hunk.id === activeId)}
          />
        )),
      )}
    </div>,
    container,
  );
}
