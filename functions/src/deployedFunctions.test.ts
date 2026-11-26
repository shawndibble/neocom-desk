import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SYNC_CORP_TAX_BOOKS_SCHEDULE, SYNC_REST_MS } from './corpSyncGrant.js';
import { BOOK_SYNC_HOURS_UTC } from './corpTaxBookSchedule.js';

const DEPLOYED = [
  'alertsCall',
  'communityCall',
  'corpTaxBookCall',
  'dailyHousekeeping',
  'dispatchProjections',
  'mintFirebaseToken',
  'mutamarketEstimate',
  'pollEveNotifications',
  'pushCommunityAlert',
  'pushCommunityPledge',
  'shortStartLink',
  'syncCorpTaxBooks',
  'vettingCall',
];

describe('deployed functions', () => {
  it('only grow by a reviewed name, never by a new per-action callable', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const exported = [...source.matchAll(/^export const (\w+)/gm)].map((m) => m[1]).sort();
    expect(exported).toEqual([...DEPLOYED].sort());
  });

  it('keeps SRP router-only', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/^export const \w*Srp\w* =/m);
  });

  it('runs syncCorpTaxBooks every 2 hours at 35 past, 00:35 UTC first (yesterday closes at 00:30)', () => {
    expect(SYNC_CORP_TAX_BOOKS_SCHEDULE).toEqual({
      schedule: '35 0,2,4,6,8,10,12,14,16,18,20,22 * * *',
      timeZone: 'UTC',
    });
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/\.\.\.SYNC_CORP_TAX_BOOKS_SCHEDULE/);
  });

  it('rests a synced book for less than the shortest gap between runs, so a late run never skips a slot', () => {
    const hours = [...BOOK_SYNC_HOURS_UTC, BOOK_SYNC_HOURS_UTC[0] + 24];
    const shortestGapMs = Math.min(...hours.slice(1).map((h, i) => (h - hours[i]) * 3_600_000));
    expect(SYNC_REST_MS).toBeLessThan(shortestGapMs);
  });
});
