import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderEvent } from '../provider.ts';
import { createAntigravityMapper, estimateCostUsd, resolveApiKey } from './antigravity.ts';

function collect() {
  const events: ProviderEvent[] = [];
  const mapper = createAntigravityMapper((e) => events.push(e));
  return { events, mapper };
}

describe('createAntigravityMapper', () => {
  it('maps a recorded turn into provider events', () => {
    const { events, mapper } = collect();
    const stream = [
      {
        event_type: 'interaction.created',
        interaction: { id: 'v1_abc', status: 'in_progress', environment_id: 'env1' },
      },
      {
        event_type: 'step.start',
        index: 0,
        step: {
          id: 'call_1',
          type: 'function_call',
          name: 'view_file',
          arguments: { AbsolutePath: '/workspace/docs/a/index.tsx' },
        },
      },
      { event_type: 'step.stop', index: 0 },
      {
        event_type: 'step.start',
        index: 1,
        step: { call_id: 'call_1', type: 'function_result', name: 'view_file', is_error: false },
      },
      { event_type: 'step.start', index: 2, step: { type: 'thought' } },
      { event_type: 'step.delta', index: 2, delta: { content: { text: 'thinking' } } },
      { event_type: 'step.stop', index: 2 },
      { event_type: 'step.start', index: 3, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 3, delta: { type: 'text', text: 'Updated ' } },
      { event_type: 'step.delta', index: 3, delta: { type: 'text', text: 'the title.' } },
      { event_type: 'step.stop', index: 3 },
      {
        event_type: 'interaction.completed',
        interaction: {
          id: 'v1_abc',
          status: 'completed',
          environment_id: 'env1',
          usage: { total_input_tokens: 100 },
        },
      },
    ];
    for (const event of stream) mapper.handle(event as never);

    expect(events).toEqual([
      { type: 'session-id', id: 'v1_abc' },
      {
        type: 'tool-start',
        id: 'call_1',
        name: 'view_file',
        title: 'Read',
        detail: 'docs/a/index.tsx',
      },
      { type: 'tool-end', id: 'call_1', ok: true },
      { type: 'text-start', id: 'v1_abc-t3' },
      { type: 'text-delta', id: 'v1_abc-t3', text: 'Updated ' },
      { type: 'text-delta', id: 'v1_abc-t3', text: 'the title.' },
      { type: 'text-end', id: 'v1_abc-t3', text: 'Updated the title.' },
    ]);
    expect(mapper.environmentId).toBe('env1');
    expect(mapper.status).toBe('completed');
    expect(mapper.usage).toEqual({ total_input_tokens: 100 });
  });

  it('turns an <open-doc-questions> reply into questions', () => {
    const { events, mapper } = collect();
    const block =
      '<open-doc-questions>[{"header":"Length","question":"How long?","multiSelect":false,"options":[{"label":"Short"},{"label":"Long"}]}]</open-doc-questions>';
    mapper.handle({ event_type: 'interaction.created', interaction: { id: 'i' } });
    mapper.handle({ event_type: 'step.start', index: 0, step: { type: 'model_output' } });
    mapper.handle({ event_type: 'step.delta', index: 0, delta: { type: 'text', text: block } });
    mapper.flush();
    expect(events.at(-2)).toEqual({ type: 'text-end', id: 'i-t0', text: '' });
    expect(events.at(-1)).toMatchObject({
      type: 'questions',
      questions: [{ header: 'Length', question: 'How long?' }],
    });
  });

  it('waits for streamed arguments before showing a call', () => {
    const { events, mapper } = collect();
    mapper.handle({
      event_type: 'step.start',
      index: 1,
      step: { id: 'c9', type: 'function_call', name: 'find_by_name' },
    });
    mapper.handle({
      event_type: 'step.delta',
      index: 1,
      delta: { type: 'arguments_delta', arguments: '{"SearchDirectory":"do' },
    });
    mapper.handle({
      event_type: 'step.delta',
      index: 1,
      delta: { type: 'arguments_delta', arguments: 'cs/a"}' },
    });
    expect(events).toEqual([]);
    mapper.handle({ event_type: 'step.stop', index: 1 });
    expect(events).toEqual([
      { type: 'tool-start', id: 'c9', name: 'find_by_name', title: 'Find files', detail: 'docs/a' },
    ]);
  });

  it('hides a shell call that --disable-bash turned away', () => {
    const { events, mapper } = collect();
    mapper.handle({
      event_type: 'step.start',
      index: 0,
      step: { id: 'b1', type: 'function_call', name: 'execute_bash' },
    });
    mapper.handle({
      event_type: 'step.delta',
      index: 0,
      delta: { type: 'arguments_delta', arguments: '{"command":"pwd"}' },
    });
    mapper.handle({ event_type: 'step.stop', index: 0 });
    mapper.handle({
      event_type: 'step.start',
      index: 1,
      step: {
        call_id: 'b1',
        type: 'function_result',
        is_error: true,
        result: { error: 'tool "execute_bash" failed: execute_bash is disabled (--disable-bash)' },
      },
    });
    mapper.flush();
    expect(events).toEqual([]);
  });

  it('still shows a shell call that failed for another reason', () => {
    const { events, mapper } = collect();
    mapper.handle({
      event_type: 'step.start',
      index: 0,
      step: {
        id: 'b2',
        type: 'function_call',
        name: 'execute_bash',
        arguments: { command: 'ls' },
      },
    });
    mapper.handle({ event_type: 'step.stop', index: 0 });
    expect(events).toEqual([]);
    mapper.handle({
      event_type: 'step.start',
      index: 1,
      step: { call_id: 'b2', type: 'function_result', is_error: true, result: { error: 'exit 2' } },
    });
    expect(events).toEqual([
      { type: 'tool-start', id: 'b2', name: 'execute_bash', title: 'Run command', detail: 'ls' },
      { type: 'tool-end', id: 'b2', ok: false },
    ]);
  });

  it('marks a failed tool result', () => {
    const { events, mapper } = collect();
    mapper.handle({
      event_type: 'step.start',
      index: 0,
      step: {
        id: 'c',
        type: 'function_call',
        name: 'run_command',
        arguments: { CommandLine: 'ls' },
      },
    });
    mapper.handle({
      event_type: 'step.start',
      index: 1,
      step: { call_id: 'c', type: 'function_result', is_error: true },
    });
    expect(events).toEqual([
      { type: 'tool-start', id: 'c', name: 'run_command', title: 'Run command', detail: 'ls' },
      { type: 'tool-end', id: 'c', ok: false },
    ]);
  });
});

describe('estimateCostUsd', () => {
  const usage = {
    total_input_tokens: 17661,
    total_cached_tokens: 7145,
    total_output_tokens: 324,
    total_thought_tokens: 304,
  };

  it('prices the measured test turn on Gemini 3.8 Flash', () => {
    const cost = estimateCostUsd('gemini-3.8-flash', usage, new Date('2026-11-14'));
    expect(cost).toBeCloseTo(0.010778, 6);
  });

  it('doubles from 2027', () => {
    const before = estimateCostUsd('gemini-3.8-flash', usage, new Date('2026-12-31'));
    const after = estimateCostUsd('gemini-3.8-flash', usage, new Date('2027-01-01'));
    expect(after).toBeCloseTo((before ?? 0) * 2, 6);
  });

  it('prices Gemini 4, with Carbon doubling from December', () => {
    const hydrogen = estimateCostUsd('gemini-4-hydrogen', usage, new Date('2026-11-14'));
    expect(hydrogen).toBeCloseTo(0.021019875, 8);
    const carbonNov = estimateCostUsd('gemini-4-carbon', usage, new Date('2026-11-30'));
    const carbonDec = estimateCostUsd('gemini-4-carbon', usage, new Date('2026-12-01'));
    expect(carbonNov).toBeCloseTo(0.0280265, 8);
    expect(carbonDec).toBeCloseTo((carbonNov ?? 0) * 2, 6);
  });

  it('gives no estimate for a model without published prices', () => {
    expect(estimateCostUsd(null, usage)).toBeNull();
    expect(estimateCostUsd('gemini-unknown', usage)).toBeNull();
  });
});

describe('resolveApiKey', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'open-doc-agy-'));
    vi.stubEnv('GEMINI_API_KEY', '');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  it('prefers the environment', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'from-env');
    await writeFile(path.join(dir, '.env'), 'GEMINI_API_KEY=from-file\n');
    expect(await resolveApiKey(dir)).toBe('from-env');
  });

  it('reads .env.local before .env, with quotes and comments', async () => {
    await writeFile(path.join(dir, '.env'), 'GEMINI_API_KEY=from-env-file\n');
    await writeFile(
      path.join(dir, '.env.local'),
      '# local\nOTHER=1\nexport GEMINI_API_KEY="from-local" # mine\n',
    );
    expect(await resolveApiKey(dir)).toBe('from-local');
  });

  it('returns null without a key', async () => {
    expect(await resolveApiKey(dir)).toBeNull();
  });
});
