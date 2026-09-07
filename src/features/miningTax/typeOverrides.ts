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
 * Device-local (Dexie `settings`, not synced): a stop-gap for the window
 * between a CCP patch and the next `npm run sde:build` picking up a new type
 * in the SDE-derived allowlists (`sde/loadSde.ts`) — a data-correction
 * workaround, not Editable Data worth syncing across devices.
 */
import { db } from '@/db';

const MOON_ORE_SETTINGS_KEY = 'miningTax.manualMoonOreTypeIds';
const IGNORED_SETTINGS_KEY = 'miningTax.manualIgnoredTypeIds';

async function loadTypeIdList(key: string): Promise<number[]> {
  const record = await db.settings.get(key);
  return Array.isArray(record?.value) ? (record.value as number[]) : [];
}

async function addTypeIdToList(key: string, typeId: number): Promise<void> {
  const existing = await loadTypeIdList(key);
  if (existing.includes(typeId)) return;
  await db.settings.put({ key, value: [...existing, typeId] });
}

async function removeTypeIdFromList(key: string, typeId: number): Promise<void> {
  const existing = await loadTypeIdList(key);
  if (!existing.includes(typeId)) return;
  await db.settings.put({ key, value: existing.filter((id) => id !== typeId) });
}

export function loadManualMoonOreTypeIds(): Promise<number[]> {
  return loadTypeIdList(MOON_ORE_SETTINGS_KEY);
}

/** Tags `typeId` as moon ore from now on — future ledger refreshes group it into entries instead of flagging it. */
export function tagAsMoonOre(typeId: number): Promise<void> {
  return addTypeIdToList(MOON_ORE_SETTINGS_KEY, typeId);
}

export function loadManualIgnoredTypeIds(): Promise<number[]> {
  return loadTypeIdList(IGNORED_SETTINGS_KEY);
}

/** Tags `typeId` as ordinary/known ore or ice — future ledger refreshes stop flagging it, but never group it into a moon-mining entry. */
export function tagAsIgnored(typeId: number): Promise<void> {
  return addTypeIdToList(IGNORED_SETTINGS_KEY, typeId);
}

/**
 * Undoes {@link tagAsMoonOre}. The type_id returns to whatever the SDE
 * allowlists say about it — unclassified again if they say nothing, which is
 * the state that put the banner in front of the pilot in the first place.
 */
export function untagMoonOre(typeId: number): Promise<void> {
  return removeTypeIdFromList(MOON_ORE_SETTINGS_KEY, typeId);
}

/** Undoes {@link tagAsIgnored}, on the same terms as {@link untagMoonOre}. */
export function untagIgnored(typeId: number): Promise<void> {
  return removeTypeIdFromList(IGNORED_SETTINGS_KEY, typeId);
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
