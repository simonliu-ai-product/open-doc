import { type MutableRefObject, useCallback, useEffect, useState } from 'react';
import { useDesignPanelState } from '../design-panel/design-provider';
import { useHistory } from '../history-provider';
import type { InspectorControls } from '../inspector/inspector';
import { SaveCard } from './save-card';

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !==
      null
  );
}

/**
 * Joins the two things that can be unsaved in the document view — text edited
 * on the page and the design draft — into one card, one ⌘S, and one history.
 *
 * Both write the same `index.tsx`, each as a read-modify-write on the server,
 * so they are saved one after the other and never at once: two writes in
 * flight would each start from the file before the other, and the second
 * would put back what the first changed.
 */
export function EditSaveCard({
  textCount,
  controlsRef,
  onShownChange,
}: {
  textCount: number;
  controlsRef: MutableRefObject<InspectorControls | null>;
  onShownChange: (shown: boolean) => void;
}) {
  const design = useDesignPanelState();
  const history = useHistory();
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = textCount + (design.dirty ? 1 : 0);

  const save = useCallback(async (): Promise<boolean> => {
    if (committing) return false;
    setCommitting(true);
    setError(null);
    try {
      const text =
        textCount > 0 && controlsRef.current ? await controlsRef.current.save() : { ok: true };
      const tokens = design.dirty ? await design.commit() : { ok: true };
      const failure = text.ok ? tokens : text;
      if (!failure.ok) {
        setError(failure.error ?? 'Not everything was saved');
        return false;
      }
      history.clear();
      return true;
    } finally {
      setCommitting(false);
    }
  }, [committing, textCount, controlsRef, design, history]);

  const discard = useCallback(() => {
    controlsRef.current?.discard();
    design.discard();
    history.clear();
    setError(null);
  }, [controlsRef, design, history]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.isComposing) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        if (count === 0) return;
        e.preventDefault();
        void save();
        return;
      }
      // Inside a field — the text being edited on the page, a hex, a number —
      // undo belongs to the field.
      if (isTypingTarget(e.target)) return;
      if (key === 'z' || (key === 'y' && e.ctrlKey)) {
        e.preventDefault();
        if (e.shiftKey || key === 'y') history.redo();
        else history.undo();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [count, save, history]);

  useEffect(() => {
    if (!design.dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [design.dirty]);

  const shown = count > 0 || committing || history.canUndo || history.canRedo || error !== null;
  useEffect(() => onShownChange(shown), [shown, onShownChange]);

  return (
    <SaveCard
      count={count}
      committing={committing || design.committing}
      error={error}
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      onSave={save}
      onDiscard={discard}
      onUndo={history.undo}
      onRedo={history.redo}
    />
  );
}
