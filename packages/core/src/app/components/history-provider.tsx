import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * One undoable change in the document view: a design tweak, or a finished
 * session of typing on the page. Undo and redo are closures over whatever the
 * change touched, so the history knows nothing about either kind.
 */
export type HistoryEntry = {
  undo: () => void;
  redo: () => void;
  /** Changes with the same key inside the coalesce window merge into one step. */
  coalesceKey?: string;
  ts: number;
};

type HistoryCtx = {
  canUndo: boolean;
  canRedo: boolean;
  record: (entry: Omit<HistoryEntry, 'ts'>) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
};

// Long enough to fold a slider drag into one step, short enough that two
// deliberate changes to the same field stay two.
const COALESCE_WINDOW_MS = 500;

const Ctx = createContext<HistoryCtx | null>(null);

export function useHistory(): HistoryCtx {
  const value = useContext(Ctx);
  if (!value) throw new Error('useHistory must be used inside <HistoryProvider>');
  return value;
}

export function HistoryProvider({ children }: { children: ReactNode }) {
  const stacksRef = useRef<{ past: HistoryEntry[]; future: HistoryEntry[] }>({
    past: [],
    future: [],
  });
  const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });
  // Set while an entry's own undo/redo runs, so the state change it makes is
  // not recorded again as a new step.
  const suppressedRef = useRef(false);

  const sync = useCallback(() => {
    const canUndo = stacksRef.current.past.length > 0;
    const canRedo = stacksRef.current.future.length > 0;
    setAvailability((previous) =>
      previous.canUndo === canUndo && previous.canRedo === canRedo
        ? previous
        : { canUndo, canRedo },
    );
  }, []);

  const record = useCallback(
    (entry: Omit<HistoryEntry, 'ts'>) => {
      if (suppressedRef.current) return;
      const ts = Date.now();
      const { past } = stacksRef.current;
      const top = past.at(-1);
      if (
        top &&
        entry.coalesceKey !== undefined &&
        top.coalesceKey === entry.coalesceKey &&
        ts - top.ts < COALESCE_WINDOW_MS
      ) {
        const merged: HistoryEntry = { ...entry, undo: top.undo, ts };
        stacksRef.current = { past: [...past.slice(0, -1), merged], future: [] };
      } else {
        stacksRef.current = { past: [...past, { ...entry, ts }], future: [] };
      }
      sync();
    },
    [sync],
  );

  const step = useCallback(
    (forward: boolean) => {
      if (suppressedRef.current) return;
      const previous = stacksRef.current;
      const top = forward ? previous.future.at(-1) : previous.past.at(-1);
      if (!top) return;
      stacksRef.current = forward
        ? { past: [...previous.past, top], future: previous.future.slice(0, -1) }
        : { past: previous.past.slice(0, -1), future: [...previous.future, top] };
      suppressedRef.current = true;
      try {
        if (forward) top.redo();
        else top.undo();
      } catch (error) {
        stacksRef.current = previous;
        throw error;
      } finally {
        suppressedRef.current = false;
        sync();
      }
    },
    [sync],
  );

  const undo = useCallback(() => step(false), [step]);
  const redo = useCallback(() => step(true), [step]);

  const clear = useCallback(() => {
    stacksRef.current = { past: [], future: [] };
    sync();
  }, [sync]);

  const value = useMemo<HistoryCtx>(
    () => ({ ...availability, record, undo, redo, clear }),
    [availability, record, undo, redo, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
