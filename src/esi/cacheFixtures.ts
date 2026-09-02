/**
 * Test-only helpers for seeding `db.esiCache`. Imported by test files only —
 * nothing in the app references this module.
 *
 * It exists because every route test that seeds a cached row is modelling the
 * same scenario ("the user comes back later and ESI is unreachable"), and that
 * scenario has to state its own age now that a row has a freshness window
 * (`cache.ts`'s `STALE_AFTER`). Seeding `Date.now()` would model something
 * else entirely — a row so recent the loader serves it as current and never
 * attempts the network, so no offline banner appears at all.
 */
import { STALE_AFTER } from './cache';

/** A `fetchedAt` far enough back that the default freshness window has lapsed. */
export const STALE_FETCHED_AT = Date.now() - STALE_AFTER.default - 60_000;
