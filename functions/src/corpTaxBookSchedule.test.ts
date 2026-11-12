import { describe, expect, it } from 'vitest';
import { BOOK_SYNC_CRON, nextScheduledBookSync } from './corpTaxBookSchedule.js';

const at = (iso: string) => Date.parse(iso);

describe('the scheduled Corp Tax Book sync times', () => {
  it('is the cron the scheduled function runs on', () => {
    expect(BOOK_SYNC_CRON).toBe('35 0,6,12,18 * * *');
  });

  it('is the next 35 past a six-hour slot', () => {
    expect(nextScheduledBookSync(at('2026-11-12T07:10:00Z'))).toBe(at('2026-11-12T12:35:00Z'));
    expect(nextScheduledBookSync(at('2026-11-12T00:00:00Z'))).toBe(at('2026-11-12T00:35:00Z'));
  });

  it('a run starting this minute is the one after', () => {
    expect(nextScheduledBookSync(at('2026-11-12T06:35:00Z'))).toBe(at('2026-11-12T12:35:00Z'));
  });

  it('crosses into the next UTC day after the last slot', () => {
    expect(nextScheduledBookSync(at('2026-11-12T18:36:00Z'))).toBe(at('2026-11-13T00:35:00Z'));
    expect(nextScheduledBookSync(at('2026-12-31T23:59:00Z'))).toBe(at('2027-01-01T00:35:00Z'));
  });
});
