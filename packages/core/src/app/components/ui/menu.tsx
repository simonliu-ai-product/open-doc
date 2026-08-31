import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '../../lib/utils';

type Placement = 'bottom-start' | 'bottom-end' | 'right-start';

type MenuProps = {
  trigger: (props: {
    onClick: (e: React.MouseEvent) => void;
    'aria-expanded': boolean;
  }) => ReactNode;
  children: (close: () => void) => ReactNode;
  placement?: Placement;
  className?: string;
};

/**
 * Minimal anchored menu. The runtime ships to users, so the browser UI stays
 * dependency-free rather than pulling in a headless-component library.
 */
export function Menu({ trigger, children, placement = 'bottom-end', className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current?.firstElementChild ?? anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const gap = 4;
    let top = placement === 'right-start' ? a.top : a.bottom + gap;
    let left = placement === 'bottom-end' ? a.right - p.width : a.left;
    if (placement === 'right-start') left = a.right + gap;
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - p.height - 8));
    setCoords({ top, left });
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, close]);

  return (
    <>
      <span ref={anchorRef} className="contents">
        {trigger({
          onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          },
          'aria-expanded': open,
        })}
      </span>
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="menu"
          className={cn(
            'fixed z-50 min-w-[180px] rounded-md border border-border bg-background p-1 shadow-lg',
            coords ? 'visible' : 'invisible',
            className,
          )}
          style={{ top: coords?.top ?? 0, left: coords?.left ?? 0 }}
        >
          {children(close)}
        </div>
      )}
    </>
  );
}

export function MenuItem({
  onClick,
  children,
  destructive = false,
  active = false,
  disabled = false,
}: {
  onClick: () => void;
  children: ReactNode;
  destructive?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
        active && 'bg-accent',
        destructive && 'text-red-600 dark:text-red-400',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}
