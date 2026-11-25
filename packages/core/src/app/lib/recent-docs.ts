const STORAGE = 'open-doc:recent';
const KEEP = 8;

export function pushRecent(list: readonly string[], docId: string): string[] {
  return [docId, ...list.filter((id) => id !== docId)].slice(0, KEEP);
}

/** Ids no longer in the workspace — deleted, or renamed by the agent — are dropped. */
export function recentAmong(list: readonly string[], known: readonly string[], limit: number) {
  const present = new Set(known);
  return list.filter((id) => present.has(id)).slice(0, limit);
}

export function readRecentDocs(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function markDocOpened(docId: string): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(pushRecent(readRecentDocs(), docId)));
  } catch {}
}
