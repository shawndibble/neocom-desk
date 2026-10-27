import { describe, it, expect } from 'vitest';
import { toCell, formatDateTime } from './exportCells';

describe('toCell', () => {
  it('maps null, undefined and non-finite numbers to an empty cell', () => {
    expect(toCell(null)).toEqual({ kind: 'empty' });
    expect(toCell(undefined)).toEqual({ kind: 'empty' });
    expect(toCell(Number.NaN)).toEqual({ kind: 'empty' });
    expect(toCell(Number.POSITIVE_INFINITY)).toEqual({ kind: 'empty' });
  });

  it('keeps finite numbers as numbers', () => {
    expect(toCell(-1500.25)).toEqual({ kind: 'number', value: -1500.25 });
  });

  it('recognises an ESI ISO-8601 UTC timestamp as a date', () => {
    const cell = toCell('2026-09-28T03:33:22Z');
    expect(cell.kind).toBe('date');
    if (cell.kind !== 'date') return;
    expect(cell.value.toISOString()).toBe('2026-09-28T03:33:22.000Z');
  });

  it('accepts fractional seconds on a timestamp', () => {
    expect(toCell('2026-09-28T03:33:22.123Z').kind).toBe('date');
  });

  it('leaves other strings — including date-looking prose — as text', () => {
    expect(toCell('Apocalypse')).toEqual({ kind: 'text', value: 'Apocalypse' });
    expect(toCell('2026-09-28T03:33:22Z and more')).toEqual({
      kind: 'text',
      value: '2026-09-28T03:33:22Z and more',
    });
    expect(toCell('')).toEqual({ kind: 'text', value: '' });
  });

  it('leaves a timestamp without a UTC designator as text rather than guessing its zone', () => {
    expect(toCell('2026-09-28T03:33:22').kind).toBe('text');
  });
});

describe('formatDateTime', () => {
  it('writes UTC (EVE time) as YYYY-MM-DD HH:MM:SS, the form spreadsheets parse as a date', () => {
    expect(formatDateTime(new Date('2026-01-02T03:04:05.678Z'))).toBe('2026-01-02 03:04:05');
  });
});
