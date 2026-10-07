import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangesResult, Revision } from '../../../ops/changes';
import type { FileChange, Hunk } from '../../../ops/changes-diff';

export type { FileChange, Hunk, Revision };

export type ChangesState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; result: ChangesResult };

/** Every hunk, flattened, with the file it belongs to. */
export type ChangeItem = { file: FileChange; hunk: Hunk };

export function itemsOf(state: ChangesState): ChangeItem[] {
  if (state.status !== 'ready' || !state.result.available) return [];
  return state.result.files.flatMap((file) => file.hunks.map((hunk) => ({ file, hunk })));
}

/**
 * The document's changes since a revision, read again whenever the document
 * reloads — an agent writing the file, a revert, a save — so the marks follow
 * the source without anyone asking.
 */
export function useChanges(docId: string | undefined, reloadKey: unknown, enabled: boolean) {
  const [since, setSince] = useState('HEAD');
  const [state, setState] = useState<ChangesState>({ status: 'loading' });
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!docId || !enabled) return;
    const id = ++request.current;
    try {
      const params = new URLSearchParams({ docId, since });
      const res = await fetch(`/__changes?${params}`);
      const body = (await res.json()) as ChangesResult & { error?: string };
      if (id !== request.current) return;
      setState(
        res.ok ? { status: 'ready', result: body } : { status: 'error', error: body.error ?? '' },
      );
    } catch (err) {
      if (id === request.current) setState({ status: 'error', error: String(err) });
    }
  }, [docId, since, enabled]);

  useEffect(() => {
    void reloadKey;
    void load();
  }, [load, reloadKey]);

  useEffect(() => {
    void reloadKey;
    if (!docId || !enabled) return;
    let cancelled = false;
    fetch(`/__changes/revisions?${new URLSearchParams({ docId })}`)
      .then((res) => res.json())
      .then((body: { revisions?: Revision[] }) => {
        if (!cancelled) setRevisions(body.revisions ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [docId, enabled, reloadKey]);

  const revert = useCallback(
    async (item: ChangeItem): Promise<string | null> => {
      if (!docId) return null;
      const res = await fetch('/__changes/revert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId, since, file: item.file.path, hunk: item.hunk.id }),
      });
      const body = (await res.json()) as { error?: string };
      // The write reloads the document, which reads the changes again; a
      // revert outside the document's own source reloads nothing, so ask.
      void load();
      return res.ok ? null : (body.error ?? 'revert failed');
    },
    [docId, since, load],
  );

  return { since, setSince, state, revisions, revert, reload: load };
}
