import {
  cloneElement,
  createContext,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * A hover-and-focus tooltip for the agent panel, without a headless-component
 * library: shown while the trigger is hovered or focused, placed under it.
 */

type TooltipState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: MutableRefObject<HTMLElement | null>;
  id: string;
};

const TooltipContext = createContext<TooltipState | null>(null);

function useTooltip(): TooltipState {
  const state = useContext(TooltipContext);
  if (!state) throw new Error('Tooltip parts must sit inside <Tooltip>');
  return state;
}

export function Tooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const id = useId();
  return (
    <TooltipContext.Provider value={{ open, setOpen, triggerRef, id }}>
      {children}
    </TooltipContext.Provider>
  );
}

type TriggerProps = {
  ref?: (node: HTMLElement | null) => void;
  'aria-describedby'?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

export function TooltipTrigger({ render }: { render: ReactElement<TriggerProps> }) {
  const { open, setOpen, triggerRef, id } = useTooltip();
  return cloneElement(render, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
    },
    'aria-describedby': open ? id : undefined,
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
  });
}

export function TooltipContent({
  side = 'bottom',
  align = 'center',
  sideOffset = 4,
  className,
  children,
}: {
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
  children: ReactNode;
}) {
  const { open, triggerRef, id } = useTooltip();
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
    let left =
      align === 'start'
        ? a.left
        : align === 'end'
          ? a.right - p.width
          : a.left + (a.width - p.width) / 2;
    const top = side === 'top' ? a.top - sideOffset - p.height : a.bottom + sideOffset;
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8));
    setCoords({ top, left });
  }, [open, side, align, sideOffset, triggerRef]);

  if (!open) return null;
  return (
    <div
      ref={panelRef}
      id={id}
      role="tooltip"
      className={cn(
        'pointer-events-none fixed z-50 rounded-[6px] bg-foreground px-2 py-1 text-[11.5px] text-background shadow-floating',
        coords ? 'visible' : 'invisible',
        className,
      )}
      style={{ top: coords?.top ?? 0, left: coords?.left ?? 0 }}
    >
      {children}
    </div>
  );
}
