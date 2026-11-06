import type { AgentCheckFinding, AgentItem, AgentSession } from './types.ts';

/** How many findings a check item keeps; the rest are only counted. */
export const CHECK_FINDINGS_KEPT = 20;

// A file's mtime can trail the clock that stamped the message by a little.
const CLOCK_SLACK_MS = 1000;

/**
 * Whether the dev server should run `open-doc check` for the turn that just
 * ended: only for an agent that cannot start a browser itself, only when the
 * turn ran to its end, and only when it touched the document's source — it
 * used a tool, and the file changed after the message. The mtime alone is not
 * enough: a document copied or made from a template a moment earlier reads as
 * fresh to a turn whose agent never even started.
 */
export function shouldCheckAfterTurn(opts: {
  session: Pick<AgentSession, 'docId' | 'items'>;
  userItemId: string;
  canOpenBrowser: boolean;
  entryMtimeMs: number | null;
}): boolean {
  const { session, userItemId, canOpenBrowser, entryMtimeMs } = opts;
  if (canOpenBrowser || !session.docId || entryMtimeMs === null) return false;
  const start = session.items.findIndex((i) => i.id === userItemId);
  if (start === -1) return false;
  const turn = session.items.slice(start + 1);
  const result = [...turn].reverse().find((i) => i.kind === 'result');
  if (result?.kind === 'result' && result.aborted) return false;
  if (!turn.some((i) => i.kind === 'tool')) return false;
  const startedAt = Date.parse(session.items[start].ts);
  return Number.isFinite(startedAt) && entryMtimeMs >= startedAt - CLOCK_SLACK_MS;
}

type Report = {
  pageCount: number;
  findings: Array<{
    page: number;
    severity: 'error' | 'warn';
    message: string;
    loc?: string;
  }>;
};

/** A check report as the transcript keeps it: errors first, the rest counted. */
export function checkItemResult(
  report: Report,
): Pick<Extract<AgentItem, { kind: 'check' }>, 'pageCount' | 'findings' | 'total'> {
  const ordered = [...report.findings].sort(
    (a, b) => Number(b.severity === 'error') - Number(a.severity === 'error') || a.page - b.page,
  );
  const findings: AgentCheckFinding[] = ordered.slice(0, CHECK_FINDINGS_KEPT).map((f) => ({
    page: f.page,
    severity: f.severity,
    message: f.message,
    ...(f.loc ? { loc: f.loc } : {}),
  }));
  return { pageCount: report.pageCount, findings, total: report.findings.length };
}
