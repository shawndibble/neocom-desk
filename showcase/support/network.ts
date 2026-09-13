/**
 * Every data surface is seeded into IndexedDB, so nothing here needs to
 * answer with a body — these hosts are simply cut off, which also stops a
 * hanging external request from holding the page's `load` event open.
 *
 * ESI and Fuzzwork are handled by `installPriceMock` instead of being cut
 * off here: prices live in an in-memory cache with no Dexie layer to seed,
 * so those four endpoints have to answer for real.
 *
 * `images.evetech.net` is the deliberate exception: real item icons off real
 * typeIDs are what make a showcase PNG look like the product rather than a
 * fixture, and an id the server doesn't know just falls back in-app.
 */
import type { Page } from '@playwright/test';

const CUT_OFF = [
  'https://login.eveonline.com/**',
  'https://*.googleapis.com/**',
  'https://*.firebaseio.com/**',
  'https://*.google-analytics.com/**',
  'https://*.ingest.sentry.io/**',
];

export async function isolateNetwork(page: Page): Promise<void> {
  for (const pattern of CUT_OFF) {
    await page.route(pattern, (route) => route.abort('blockedbyclient'));
  }
}
