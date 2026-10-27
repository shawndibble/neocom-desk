import { describe, it, expect } from 'vitest';
import { activeDismissalFor, reverseDismissal, type Dismissal } from './dismissals';

const charge = {
  key: '90000001:1001:2026-07-12',
  minerId: 'm1',
  moonId: 40000001,
  extractionId: 'x1',
  date: '2026-07-12',
};

function dismissal(overrides: Partial<Dismissal>): Dismissal {
  return {
    id: 'd1',
    scope: 'record',
    targetId: charge.key,
    by: 95000001,
    at: '2026-07-20T10:00:00Z',
    reason: 'Fleet op',
    ...overrides,
  };
}

describe('activeDismissalFor', () => {
  it('matches a record, Miner, moon or Extraction dismissal', () => {
    expect(activeDismissalFor(charge, [dismissal({})])?.id).toBe('d1');
    expect(
      activeDismissalFor(charge, [dismissal({ scope: 'miner', targetId: 'm1' })])
    ).toBeDefined();
    expect(
      activeDismissalFor(charge, [dismissal({ scope: 'moon', targetId: '40000001' })])
    ).toBeDefined();
    expect(
      activeDismissalFor(charge, [dismissal({ scope: 'extraction', targetId: 'x1' })])
    ).toBeDefined();
  });

  it('ignores dismissals aimed elsewhere', () => {
    expect(
      activeDismissalFor(charge, [
        dismissal({ targetId: 'other' }),
        dismissal({ scope: 'miner', targetId: 'm2' }),
        dismissal({ scope: 'moon', targetId: '40000002' }),
        dismissal({ scope: 'extraction', targetId: 'x2' }),
      ])
    ).toBeUndefined();
  });

  it('a Miner or moon dismissal covers mining up to the day it was made, not later days', () => {
    const miner = dismissal({ scope: 'miner', targetId: 'm1', at: '2026-07-12T01:00:00Z' });
    expect(activeDismissalFor(charge, [miner])).toBeDefined();
    expect(activeDismissalFor({ ...charge, date: '2026-07-13' }, [miner])).toBeUndefined();
  });

  it('a reversed dismissal no longer applies', () => {
    const reversed = reverseDismissal(dismissal({}), { by: 95000002, at: '2026-07-21T00:00:00Z' });
    expect(activeDismissalFor(charge, [reversed])).toBeUndefined();
  });
});

describe('reverseDismissal', () => {
  it('keeps the dismissal and records who reversed it and when — never deletes it', () => {
    const original = dismissal({});
    const reversed = reverseDismissal(original, { by: 95000002, at: '2026-07-21T00:00:00Z' });
    expect(reversed).toEqual({
      ...original,
      reversed: { by: 95000002, at: '2026-07-21T00:00:00Z' },
    });
    expect(original.reversed).toBeUndefined();
  });

  it('refuses to reverse twice', () => {
    const reversed = reverseDismissal(dismissal({}), { by: 1, at: '2026-07-21T00:00:00Z' });
    expect(() => reverseDismissal(reversed, { by: 2, at: '2026-07-22T00:00:00Z' })).toThrow();
  });
});
