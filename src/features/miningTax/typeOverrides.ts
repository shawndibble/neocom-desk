/**
 * User-confirmed overrides for the Moon Mining Tax ledger's "unclassified
 * ore" banner (issue #523, decision doc: "surfaces as an explicit
 * 'unclassified ore' banner with a manual tag action — never silently
 * dropped"). Two independent actions, both stop the type_id from showing as
 * unclassified, but differ in what happens to it next:
 *
 * - "Tag as moon ore": treat it as moon ore from now on — it groups into
 *   Mining Ledger Entries like any other moon-goo type_id.
 * - "Ignore": treat it as ordinary, already-known ore/ice — it stops being
 *   flagged, but is never grouped into a moon-mining entry either, the same
 *   as asteroid ore and ice today.
 *
 * Both are reversible. They were append-only until a mis-click was found to
 * be unrecoverable: tagging a real moon-ore type as "Ignore" drops it out of
 * the ledger for good, and once the banner has no unclassified ids left it
 * disappears, taking the only route to this module with it. A correction the
 * pilot cannot correct is worse than the misclassification it was meant to
 * fix, so `untagMoonOre`/`untagIgnored` exist and the route surfaces them.
 *
 * Cross-device (Editable Data, decision doc
 * 20260923-112603-manual-ore-tags-sync-across-devices):
 * each list is one `sync.`-prefixed Dexie key on `SYNCED_SETTING_KEYS`
 * (`sync/syncedSettings.ts`), not two — a pilot who tags a type on one device
 * must not have to re-tag it on every other. Originally device-local, on the
 * reasoning that a CCP patch and the next `npm run sde:build` would absorb
 * most gaps quickly; that undersold how long a genuinely unpublished type
 * (never on the market, so never in the SDE-derived allowlists at all —
 * `sde/loadSde.ts`) stays unclassified. Same write shape as
 * `lib/useSyncedSetting.ts`'s store: a bare `db.settings.put` first (the
 * pilot's tag must land even if the lazy Firebase chunk fails to load), then
 * `setSyncedSetting` to stamp it for last-write-wins merging, then
 * `scheduleSync` for every tracked Character — this data is device-global
 * while sync itself is per-Character, so pushing under only one leaves a
 * device that holds only the other Character never seeing the tag. Each key
 * adopts its pre-sync value from the plain key it used to be stored under,
 * unstamped, the same one-time migration `lib/useSyncedSetting.ts` documents.
 */
import { db } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { scheduleSync, setSyncedSetting } from '@/sync';

const MOON_ORE_SETTINGS_KEY = 'sync.miningTaxManualMoonOreTypeIds';
const IGNORED_SETTINGS_KEY = 'sync.miningTaxManualIgnoredTypeIds';
const LEGACY_MOON_ORE_SETTINGS_KEY = 'miningTax.manualMoonOreTypeIds';
const LEGACY_IGNORED_SETTINGS_KEY = 'miningTax.manualIgnoredTypeIds';

async function loadTypeIdList(key: string, legacyKey: string): Promise<number[]> {
  const record = await db.settings.get(key);
  if (record !== undefined) return Array.isArray(record.value) ? (record.value as number[]) : [];
  const legacy = await db.settings.get(legacyKey);
  if (legacy === undefined) return [];
  const value = Array.isArray(legacy.value) ? (legacy.value as number[]) : [];
  // Unstamped adoption, like lib/useSyncedSetting.ts: a tag this device made
  // months ago must not outrank a real edit made on another device
  // yesterday. Bare put, not setSyncedSetting — it reads as updatedAt: 0 and
  // any remote copy wins; with no remote copy it pushes as-is.
  await db.settings.put({ key, value });
  return value;
}

/** `db.settings` write, then the synced-setting push — same fire-and-forget shape as `lib/useSyncedSetting.ts`'s write(). */
async function writeTypeIdList(key: string, value: number[]): Promise<void> {
  await db.settings.put({ key, value });
  if (!isSyncConfigured()) return;
  try {
    await setSyncedSetting(key, value);
    const characters = await db.characters.toArray();
    for (const character of characters) scheduleSync(character.characterId);
  } catch {
    // The tag is already on disk; the next successful sync pushes it.
  }
}

async function addTypeIdToList(key: string, legacyKey: string, typeId: number): Promise<void> {
  const existing = await loadTypeIdList(key, legacyKey);
  if (existing.includes(typeId)) return;
  await writeTypeIdList(key, [...existing, typeId]);
}

async function removeTypeIdFromList(key: string, legacyKey: string, typeId: number): Promise<void> {
  const existing = await loadTypeIdList(key, legacyKey);
  if (!existing.includes(typeId)) return;
  await writeTypeIdList(
    key,
    existing.filter((id) => id !== typeId)
  );
}

export function loadManualMoonOreTypeIds(): Promise<number[]> {
  return loadTypeIdList(MOON_ORE_SETTINGS_KEY, LEGACY_MOON_ORE_SETTINGS_KEY);
}

/** Tags `typeId` as moon ore from now on — future ledger refreshes group it into entries instead of flagging it. */
export function tagAsMoonOre(typeId: number): Promise<void> {
  return addTypeIdToList(MOON_ORE_SETTINGS_KEY, LEGACY_MOON_ORE_SETTINGS_KEY, typeId);
}

export function loadManualIgnoredTypeIds(): Promise<number[]> {
  return loadTypeIdList(IGNORED_SETTINGS_KEY, LEGACY_IGNORED_SETTINGS_KEY);
}

/** Tags `typeId` as ordinary/known ore or ice — future ledger refreshes stop flagging it, but never group it into a moon-mining entry. */
export function tagAsIgnored(typeId: number): Promise<void> {
  return addTypeIdToList(IGNORED_SETTINGS_KEY, LEGACY_IGNORED_SETTINGS_KEY, typeId);
}

/**
 * Undoes {@link tagAsMoonOre}. The type_id returns to whatever the SDE
 * allowlists say about it — unclassified again if they say nothing, which is
 * the state that put the banner in front of the pilot in the first place.
 */
export function untagMoonOre(typeId: number): Promise<void> {
  return removeTypeIdFromList(MOON_ORE_SETTINGS_KEY, LEGACY_MOON_ORE_SETTINGS_KEY, typeId);
}

/** Undoes {@link tagAsIgnored}, on the same terms as {@link untagMoonOre}. */
export function untagIgnored(typeId: number): Promise<void> {
  return removeTypeIdFromList(IGNORED_SETTINGS_KEY, LEGACY_IGNORED_SETTINGS_KEY, typeId);
}

/** Both override lists as one read, for the review surface that shows them side by side. */
export interface TypeOverrides {
  moonOreTypeIds: number[];
  ignoredTypeIds: number[];
}

export async function loadTypeOverrides(): Promise<TypeOverrides> {
  const [moonOreTypeIds, ignoredTypeIds] = await Promise.all([
    loadManualMoonOreTypeIds(),
    loadManualIgnoredTypeIds(),
  ]);
  return { moonOreTypeIds, ignoredTypeIds };
}
