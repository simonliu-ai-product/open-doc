import { useEffect, useRef, useState } from 'react';
import { docIds, loadDoc } from './docs';

/**
 * Every document's display title, resolved once `enabled` first turns true —
 * kept lazy since it imports every document module.
 */
export function useDocTitles(enabled: boolean): Record<string, string> {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;
    void Promise.all(
      docIds.map(async (id): Promise<[string, string]> => {
        try {
          const mod = await loadDoc(id);
          return [id, mod.meta?.title ?? id];
        } catch {
          return [id, id];
        }
      }),
    ).then((entries) => setTitles(Object.fromEntries(entries)));
  }, [enabled]);

  return titles;
}
