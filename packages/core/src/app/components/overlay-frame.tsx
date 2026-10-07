import { type CSSProperties, type ReactNode, useLayoutEffect, useState } from 'react';

type Rect = { left: number; top: number; width: number; height: number };

function sameRect(a: Rect | null, b: Rect) {
  return (
    a !== null &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

/**
 * A box drawn over an element on the page, in the scroller's content
 * coordinates so it scrolls with the sheets. The inspector's frames and the
 * changes view's marks are both this.
 */
export function OverlayFrame({
  anchor,
  container,
  style,
  children,
}: {
  anchor: HTMLElement | null;
  container: HTMLElement;
  style: CSSProperties;
  children?: ReactNode;
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  // Deliberately no dependency array. Opening a side pane re-zooms and re-centres
  // the pages, which moves the anchor without resizing it — ResizeObserver never
  // sees that, and the zoom lands a frame after the observer would have fired.
  // Measuring after every render is what keeps the frame on its element; the
  // value comparison below stops that from looping.
  useLayoutEffect(() => {
    if (!anchor?.isConnected) {
      setRect(null);
      return;
    }
    // The overlay is absolutely positioned inside the scroller, so its origin
    // is the content box — frames live in content coordinates and scroll along
    // with the pages.
    const measure = () => {
      const a = anchor.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      const next = {
        left: a.left - c.left + container.scrollLeft,
        top: a.top - c.top + container.scrollTop,
        width: a.width,
        height: a.height,
      };
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(anchor);
    ro.observe(container);
    container.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      container.removeEventListener('scroll', measure);
    };
  });

  if (!rect) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute rounded-[2px]"
      style={{ ...rect, ...style }}
    >
      {children}
    </div>
  );
}
