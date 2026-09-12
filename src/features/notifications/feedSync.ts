/**
 * Writing a feed row and *pushing* it are two different jobs, and this module
 * is the second one.
 *
 * Dismissing an alert is an edit like every other synced edit: the row's
 * `dismissedAt` has to reach the other device, or the same alert is dismissed
 * twice — once per device. Every sibling collection does that by calling
 * `scheduleSync` at the mutation site (`miningTax/payees.ts`,
 * `miningTax/assignments.ts`, `market/useQuickbar.ts`); the feed did not, so
 * a dismissal only left the device on whatever sync some *unrelated* edit
 * happened to trigger next.
 *
 * Why this is not simply two lines inside `feed.ts`: `sw.ts` imports that
 * module, and `@/sync` reaches Firebase. The Service Worker has no Firebase
 * session to sync with — a push arrives with no Character context and no
 * minted token (ADR 0001) — so pulling `@/sync` into `feed.ts`'s import graph
 * would put the whole sync driver in the worker bundle to serve a caller that
 * can never use it. `@/sync`'s own `await import('./planSync')` split does
 * not save it either: `vite.config.ts` builds the worker with
 * `injectManifest` and no `type: 'module'`, and rollup inlines dynamic
 * imports into a single-file IIFE. A row the worker records still syncs; it
 * does so on the next page-context sync, which the merge
 * (`feed.mergeFeedRecord`) is already built to absorb.
 *
 * So: `feed.ts` owns the local write, this module owns the write *plus* the
 * push, and only page-context callers import it.
 */
import { scheduleSync } from '@/sync';
import {
  dismissFeedEntries,
  recordFeedEntry,
  type NewNotificationFeedEntry,
  type NotificationFeedEntry,
} from './feed';

/**
 * Dismisses the given rows and pushes each affected Character's dismissals.
 *
 * One per Character, not one per row: the Alerts page lists Characters
 * together, so "dismiss all" routinely spans them, and each syncs under its
 * own uid (`sync/planSync.syncFeed`).
 */
export async function dismissFeedEntriesAndSync(
  rows: readonly Pick<NotificationFeedEntry, 'id' | 'characterId'>[]
): Promise<void> {
  await dismissFeedEntries(rows.map((row) => row.id));
  for (const characterId of new Set(rows.map((row) => row.characterId))) scheduleSync(characterId);
}

/**
 * The same, for a caller holding Occurrence Keys rather than rows — the
 * Foreground Poller's retraction, which knows which Characters it is
 * retracting for but has already reduced its fires to keys.
 *
 * Keys and Characters arrive as two lists rather than paired up because the
 * dismissal does not need the pairing and the badge does not want it: one
 * `dismissFeedEntries` is one table scan and one badge recomputation, where a
 * call per Character would be N of each.
 */
export async function dismissFeedKeysAndSync(
  characterIds: readonly number[],
  occurrenceKeys: readonly string[]
): Promise<void> {
  await dismissFeedEntries(occurrenceKeys);
  for (const characterId of new Set(characterIds)) scheduleSync(characterId);
}

/**
 * Records one occurrence and pushes it. The dismissal's mirror image: a row
 * that never uploads cannot carry its dismissal across later, and the other
 * device would raise the alert again off its own diff instead of seeing this
 * one.
 */
export async function recordFeedEntryAndSync(entry: NewNotificationFeedEntry): Promise<void> {
  await recordFeedEntry(entry);
  scheduleSync(entry.characterId);
}
