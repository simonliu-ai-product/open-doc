import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type DesignSystem, defaultDesign, designToCssVars } from '../../lib/design';
import { shuffleDesign } from '../../lib/design-presets';
import { useT } from '../../lib/i18n';
import { useHistory } from '../history-provider';
import { useDesign as useDesignFetch } from './use-design';

type DesignCtx = {
  docId: string;
  loaded: boolean;
  exists: boolean;
  warning: string | null;
  design: DesignSystem | null;
  draft: DesignSystem | null;
  dirty: boolean;
  committing: boolean;
  error: string | null;
  /** `coalesceKey` folds a run of changes to one field — a slider drag — into one undo step. */
  update: (mut: (next: DesignSystem) => void, coalesceKey?: string) => void;
  commit: () => Promise<{ ok: boolean; error?: string }>;
  discard: () => void;
  resetToDefaults: () => void;
  shuffle: () => void;
};

const Ctx = createContext<DesignCtx | null>(null);

export function useDesignPanelState(): DesignCtx {
  const value = useContext(Ctx);
  if (!value) throw new Error('useDesignPanelState must be used inside <DesignProvider>');
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function DesignProvider({ docId, children }: { docId: string; children: ReactNode }) {
  const { design, exists, warning, loaded, save } = useDesignFetch(docId);
  const [draft, setDraft] = useState<DesignSystem | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useHistory();
  const t = useT();
  const draftRef = useRef<DesignSystem | null>(null);
  draftRef.current = draft;

  useEffect(() => {
    if (design) setDraft(clone(design));
  }, [design]);

  const dirty = useMemo(() => {
    if (!draft || !design) return false;
    return JSON.stringify(draft) !== JSON.stringify(design);
  }, [draft, design]);

  /** Every change to the draft goes through here, so every change can be undone. */
  const change = useCallback(
    (next: DesignSystem, coalesceKey?: string) => {
      const prev = draftRef.current;
      if (!prev) return;
      setDraft(next);
      history.record({ coalesceKey, undo: () => setDraft(prev), redo: () => setDraft(next) });
    },
    [history],
  );

  const update = useCallback(
    (mut: (next: DesignSystem) => void, coalesceKey?: string) => {
      const prev = draftRef.current;
      if (!prev) return;
      const next = clone(prev);
      mut(next);
      change(next, coalesceKey);
    },
    [change],
  );

  const commit = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return { ok: true };
    setCommitting(true);
    const result = await save(current);
    setCommitting(false);
    const error = result.ok ? null : (result.error ?? t('Failed to save'));
    setError(error);
    return error ? { ok: false, error } : { ok: true };
  }, [save, t]);

  const discard = useCallback(() => {
    if (design) setDraft(clone(design));
    setError(null);
  }, [design]);

  const resetToDefaults = useCallback(() => change(clone(defaultDesign)), [change]);
  const shuffle = useCallback(() => change(clone(shuffleDesign(draftRef.current))), [change]);

  // PageFrame writes its design vars inline on each page root, so the draft
  // overlay has to outrank inline styles — hence `!important`.
  const previewCss = useMemo(() => {
    if (!dirty || !draft) return '';
    const lines = Object.entries(designToCssVars(draft))
      .map(([k, v]) => `  ${k}: ${v} !important;`)
      .join('\n');
    return `[data-od-page] {\n${lines}\n}`;
  }, [dirty, draft]);

  const value: DesignCtx = {
    docId,
    loaded,
    exists,
    warning,
    design,
    draft,
    dirty,
    committing,
    error,
    update,
    commit,
    discard,
    resetToDefaults,
    shuffle,
  };

  return (
    <Ctx.Provider value={value}>
      {previewCss && (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted local css built from draft state
        <style dangerouslySetInnerHTML={{ __html: previewCss }} />
      )}
      {children}
    </Ctx.Provider>
  );
}
