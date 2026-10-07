import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { ChangeMark } from '../../../ops/changes-diff';
import { OverlayFrame } from '../overlay-frame';
import { elementsAtLoc } from '../page-placement';
import type { ChangeItem } from './use-changes';

/** Every element on the page that one change touches, with how it is marked. */
export function elementsOf(
  container: ParentNode,
  item: ChangeItem,
): Array<{ el: HTMLElement; mark: ChangeMark }> {
  return item.hunk.targets.flatMap((target) =>
    elementsAtLoc(container, target.loc).map((el) => ({ el, mark: target.mark })),
  );
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
