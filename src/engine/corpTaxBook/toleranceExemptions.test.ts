import { describe, expect, it } from 'vitest';
import { exemptionsOf, type ToleranceExemption } from './toleranceExemptions';

const ex = (id: string, minerId: string, date: string, forgive: number, at: string) =>
  ({ id, minerId, date, forgive, reason: 'x', by: 1, at }) satisfies ToleranceExemption;

describe('exemptionsOf', () => {
  it('lets the newest exemption for a day decide, and only for that Miner', () => {
    const list = [
      ex('a', 'solo:1', '2026-10-15', 0, '2026-10-18T10:00:00Z'),
      ex('b', 'solo:1', '2026-10-15', 500, '2026-10-19T10:00:00Z'),
      ex('c', 'solo:2', '2026-10-15', 9, '2026-10-20T10:00:00Z'),
      ex('d', 'solo:1', '2026-10-16', 0, '2026-10-18T10:00:00Z'),
    ];
    expect(exemptionsOf(list, 'solo:1')).toEqual(
      new Map([
        ['2026-10-15', 500],
        ['2026-10-16', 0],
      ])
    );
  });
  it('is empty with none', () => {
    expect(exemptionsOf(undefined, 'solo:1').size).toBe(0);
  });
});
