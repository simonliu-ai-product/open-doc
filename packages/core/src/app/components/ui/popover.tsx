import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * The popover the agent panel's model menu opens, without a headless-component
 * library: an anchored panel that closes on an outside press, Escape, a scroll
 * or a resize — the same contract as `Menu`.
 */

type PopoverState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement>;
};

const PopoverContext = createContext<PopoverState | null>(null);

function usePopover(): PopoverState {
  const state = useContext(PopoverContext);
  if (!state) throw new Error('Popover parts must sit inside <Popover>');
  return state;
}

export function Popover({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <PopoverContext.Provider value={{ open, setOpen: onOpenChange, triggerRef }}>
      {children}
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({ onClick, ...props }: ComponentProps<'button'>) {
  const { open, setOpen, triggerRef } = usePopover();
  return (
    <button
      ref={triggerRef}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => {
        onClick?.(event);
        setOpen(!open);
      }}
      {...props}
    />
  );
}

export function PopoverContent({
  align = 'center',
  className,
  style,
  ...props
}: ComponentProps<'div'> & { align?: 'start' | 'center' | 'end' }) {
  const { open, setOpen, triggerRef } = usePopover();
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const anchor = triggerRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const gap = 4;
    let left =
      align === 'start'
        ? a.left
        : align === 'end'
          ? a.right - p.width
          : a.left + (a.width - p.width) / 2;
    let top = a.bottom + gap;
    if (top + p.height > window.innerHeight - 8) top = a.top - gap - p.height;
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - p.height - 8));
    setCoords({ top, left });
  }, [open, align, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      triggerRef.current?.focus();
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, setOpen, triggerRef]);

  if (!open) return null;
  return (
    <div
      ref={panelRef}
      role="dialog"
      className={cn(
        'fixed z-50 rounded-[8px] border border-hairline bg-popover text-popover-foreground shadow-floating outline-none',
        coords ? 'visible' : 'invisible',
        className,
      )}
      style={{ ...style, top: coords?.top ?? 0, left: coords?.left ?? 0 }}
      {...props}
    />
  );
}
