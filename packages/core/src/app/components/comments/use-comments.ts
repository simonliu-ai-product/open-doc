import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocComment } from '../../../editing/comments';

export type { DocComment };

export type CommentsState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; comments: DocComment[] };

/**
 * The document's pending comments, oldest first — the order the agent works
 * through them. Read again on every reload, so a note the agent applied and
 * removed leaves the list on its own.
 */
export function useComments(docId: string | undefined, reloadKey: unknown, enabled: boolean) {
  const [state, setState] = useState<CommentsState>({ status: 'loading' });
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!docId || !enabled) return;
    const id = ++request.current;
    try {
      const res = await fetch(`/__comments?${new URLSearchParams({ docId })}`);
      const body = (await res.json()) as { comments?: DocComment[]; error?: string };
      if (id !== request.current) return;
      setState(
        res.ok
          ? {
              status: 'ready',
              comments: [...(body.comments ?? [])].sort((a, b) => a.ts.localeCompare(b.ts)),
            }
          : { status: 'error', error: body.error ?? '' },
      );
    } catch (err) {
      if (id === request.current) setState({ status: 'error', error: String(err) });
    }
  }, [docId, enabled]);

  useEffect(() => {
    void reloadKey;
    void load();
  }, [load, reloadKey]);

  /** Done with a note: its marker comes out of the source. */
  const resolve = useCallback(
    async (comment: DocComment): Promise<string | null> => {
      if (!docId) return null;
      const res = await fetch(`/__comments?${new URLSearchParams({ docId, id: comment.id })}`, {
        method: 'DELETE',
      });
      void load();
      if (res.ok) return null;
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return body.error ?? 'Could not resolve the comment';
    },
    [docId, load],
  );

  return { state, resolve, reload: load };
}
