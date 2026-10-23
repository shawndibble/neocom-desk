import { describe, expect, it } from 'vitest';
import { SRP_RETENTION_MS, decideSrpClaimSweep } from './srpRetention.js';

const CLOSED = Date.parse('2025-10-23T12:00:00Z');
const YEAR_LATER = CLOSED + SRP_RETENTION_MS;

describe('decideSrpClaimSweep', () => {
  it('retention is 365 days', () => {
    expect(SRP_RETENTION_MS).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it.each(['paid', 'rejected'] as const)('deletes a %s claim exactly at one year', (state) => {
    expect(decideSrpClaimSweep({ state, closedAt: CLOSED }, YEAR_LATER)).toBe('delete');
  });

  it('keeps a closed claim 1 ms under a year', () => {
    expect(decideSrpClaimSweep({ state: 'paid', closedAt: CLOSED }, YEAR_LATER - 1)).toBe('keep');
  });

  it.each(['pending', 'approved'] as const)('never deletes a %s claim, however old', (state) => {
    expect(decideSrpClaimSweep({ state, closedAt: CLOSED }, YEAR_LATER * 3)).toBe('keep');
    expect(decideSrpClaimSweep({ state }, YEAR_LATER * 3)).toBe('keep');
  });

  it('keeps a rejected claim that was re-filed (back to pending, closedAt cleared or stale)', () => {
    expect(decideSrpClaimSweep({ state: 'pending', closedAt: CLOSED }, YEAR_LATER + 1)).toBe(
      'keep'
    );
    expect(decideSrpClaimSweep({ state: 'pending', closedAt: null }, YEAR_LATER + 1)).toBe('keep');
  });

  it('times a re-filed claim rejected again from its latest close', () => {
    const second = CLOSED + 40 * 24 * 60 * 60 * 1000;
    expect(decideSrpClaimSweep({ state: 'rejected', closedAt: second }, YEAR_LATER)).toBe('keep');
    expect(
      decideSrpClaimSweep({ state: 'rejected', closedAt: second }, second + SRP_RETENTION_MS)
    ).toBe('delete');
  });

  it('keeps a closed claim with a missing or malformed closedAt, never guessed', () => {
    for (const closedAt of [undefined, null, NaN, Infinity, '1', 0, -5]) {
      expect(decideSrpClaimSweep({ state: 'paid', closedAt }, YEAR_LATER * 3)).toBe('keep');
    }
  });

  it('keeps an unknown state', () => {
    expect(decideSrpClaimSweep({ state: 'weird', closedAt: CLOSED }, YEAR_LATER * 3)).toBe('keep');
    expect(decideSrpClaimSweep({ closedAt: CLOSED }, YEAR_LATER * 3)).toBe('keep');
  });
});
