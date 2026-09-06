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
