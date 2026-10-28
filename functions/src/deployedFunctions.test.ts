import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SYNC_CORP_TAX_BOOKS_SCHEDULE } from './corpSyncGrant.js';

/**
 * Every `export const` of `index.ts` is a function Cloud Functions deploys, and a full deploy has a
 * per-minute mutation quota. So a new callable is NOT a new export: register it as an action of its
 * group's router (`corpTaxBookAction`, `communityCallable`'s group, `alertsCallable`'s group in
 * `callableRouter.ts`) and call it from the client with `callRouted` (`src/sync/routedCallable.ts`).
 * Add a name here only for a function that cannot be a callable action: a scheduled job, a Firestore
 * or HTTP trigger, or a router itself. State why in the PR.
 */
const DEPLOYED = [
  'alertsCall',
  'communityCall',
  'corpTaxBookCall',
  'dailyHousekeeping',
  'dispatchProjections',
  'mintFirebaseToken',
  'mutamarketEstimate',
  'pollEveNotifications',
  // Firestore triggers (issue #5121): community alerts pushed on the backend's own write.
  'pushCommunityAlert',
  'pushCommunityPledge',
  'syncCorpTaxBooks',
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

  it('runs syncCorpTaxBooks at 00:35, 06:35, 12:35 and 18:35 UTC (yesterday closes at 00:30)', () => {
    expect(SYNC_CORP_TAX_BOOKS_SCHEDULE).toEqual({
      schedule: '35 0,6,12,18 * * *',
      timeZone: 'UTC',
    });
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/\.\.\.SYNC_CORP_TAX_BOOKS_SCHEDULE/);
  });
});
