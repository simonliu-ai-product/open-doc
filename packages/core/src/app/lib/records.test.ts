import { describe, expect, it } from 'vitest';
import { getRecordState, recordFileName, recordLabel, setRecordIndex, setRecords } from './records';

describe('recordFileName', () => {
  const row = { name: 'Lin Mei', company: 'Acme / Asia', score: 92 };

  it('fills columns and the row number', () => {
    expect(recordFileName('certificate-{name}', row, 2, 120)).toBe('certificate-Lin Mei');
    expect(recordFileName('{#}-{company}', row, 2, 120)).toBe('003-Acme - Asia');
  });

  it('numbers a pattern without placeholders, so each row gets its own file', () => {
    expect(recordFileName('awards', row, 0, 9)).toBe('awards-1');
  });

  it('falls back to the number when the pattern fills to nothing', () => {
    expect(recordFileName('{missing}', row, 4, 12)).toBe('05');
  });
});

describe('recordLabel', () => {
  it('uses the named column, else the first value', () => {
    expect(recordLabel({ id: '', name: 'Ada' }, 0)).toBe('Ada');
    expect(recordLabel({ id: 'x7', name: 'Ada' }, 0, 'name')).toBe('Ada');
    expect(recordLabel(undefined, 3)).toBe('4');
  });
});

describe('the record store', () => {
  it('keeps the index inside the rows', () => {
    setRecords([{ a: 1 }, { a: 2 }], 5);
    expect(getRecordState().index).toBe(1);
    setRecordIndex(-3);
    expect(getRecordState().index).toBe(0);
    setRecords(undefined);
    expect(getRecordState()).toEqual({ records: [], index: 0 });
  });
});
