import { describe, expect, it } from 'vitest';
import { CHECK_FINDINGS_KEPT, checkItemResult, shouldCheckAfterTurn } from './check-after-turn.ts';
import { checkFixPrompt } from './prompt.ts';
import type { AgentItem } from './types.ts';

const at = '2026-11-06T08:00:00.000Z';
const startedMs = Date.parse(at);

function session(items: AgentItem[], docId: string | null = 'report') {
  return { docId, items };
}

const user: AgentItem = { kind: 'user', id: 'u1', ts: at, text: 'Shorten the intro' };
const tool: AgentItem = {
  kind: 'tool',
  id: 't1',
  ts: at,
  name: 'file_change',
  title: 'Edit',
  detail: 'docs/report/index.tsx',
  status: 'done',
};
const done: AgentItem = {
  kind: 'result',
  id: 'r1',
  ts: at,
  durationMs: 1000,
  costUsd: null,
  aborted: false,
};

describe('shouldCheckAfterTurn', () => {
  const base = {
    session: session([user, tool, done]),
    userItemId: 'u1',
    canOpenBrowser: false,
    entryMtimeMs: startedMs + 5000,
  };

  it('checks a turn that wrote the document, for an agent without a browser', () => {
    expect(shouldCheckAfterTurn(base)).toBe(true);
  });

  it('leaves it to an agent that can run the check itself', () => {
    expect(shouldCheckAfterTurn({ ...base, canOpenBrowser: true })).toBe(false);
  });

  it('skips a turn that left the document alone', () => {
    expect(shouldCheckAfterTurn({ ...base, entryMtimeMs: startedMs - 60_000 })).toBe(false);
  });

  it('skips a turn in which the agent used no tool, however fresh the file', () => {
    expect(shouldCheckAfterTurn({ ...base, session: session([user, done]) })).toBe(false);
  });

  it('allows for a file clock a little behind the message', () => {
    expect(shouldCheckAfterTurn({ ...base, entryMtimeMs: startedMs - 500 })).toBe(true);
  });

  it('skips a stopped turn, a missing document and an unknown message', () => {
    const stopped: AgentItem = { ...done, aborted: true } as AgentItem;
    expect(shouldCheckAfterTurn({ ...base, session: session([user, tool, stopped]) })).toBe(false);
    expect(shouldCheckAfterTurn({ ...base, session: session([user, tool, done], null) })).toBe(
      false,
    );
    expect(shouldCheckAfterTurn({ ...base, entryMtimeMs: null })).toBe(false);
    expect(shouldCheckAfterTurn({ ...base, userItemId: 'u-missing' })).toBe(false);
  });
});

describe('checkItemResult', () => {
  it('puts errors first, by page, and counts what it does not keep', () => {
    const findings = [
      { page: 2, rule: 'x', severity: 'warn' as const, message: 'small type' },
      { page: 3, rule: 'x', severity: 'error' as const, message: 'clipped', loc: '12:4' },
      { page: 1, rule: 'x', severity: 'error' as const, message: 'empty sheet' },
    ];
    const result = checkItemResult({ pageCount: 3, findings });
    expect(result.total).toBe(3);
    expect(result.pageCount).toBe(3);
    expect(result.findings.map((f) => f.message)).toEqual(['empty sheet', 'clipped', 'small type']);
    expect(result.findings[1]).toEqual({
      page: 3,
      severity: 'error',
      message: 'clipped',
      loc: '12:4',
    });
  });

  it(`keeps at most ${CHECK_FINDINGS_KEPT}`, () => {
    const findings = Array.from({ length: 30 }, (_, n) => ({
      page: n + 1,
      severity: 'warn' as const,
      message: `w${n}`,
    }));
    const result = checkItemResult({ pageCount: 30, findings });
    expect(result.findings).toHaveLength(CHECK_FINDINGS_KEPT);
    expect(result.total).toBe(30);
  });
});

describe('checkFixPrompt', () => {
  it('lists each finding with its page and source location, and what was left out', () => {
    const text = checkFixPrompt(
      'report',
      [
        { page: 2, severity: 'error', message: 'Text runs past the page edge', loc: '40:6' },
        { page: 0, severity: 'warn', message: 'No heading' },
      ],
      5,
    );
    expect(text).toContain('open-doc check');
    expect(text).toContain('"report"');
    expect(text).toContain('- page 2 [error] Text runs past the page edge (at 40:6)');
    expect(text).toContain('- document [warn] No heading');
    expect(text).toContain('3 more');
  });
});
