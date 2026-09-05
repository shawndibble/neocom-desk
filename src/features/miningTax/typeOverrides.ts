/**
 * User-confirmed "treat this type_id as moon ore" overrides for the Moon
 * Mining Tax ledger's "unclassified ore" banner (issue #523, decision doc:
 * "surfaces as an explicit 'unclassified ore' banner with a manual tag
 * action — never silently dropped"). This is that action.
 *
 * Device-local (Dexie `settings`, not synced): a stop-gap for the window
 * between a CCP patch and the next `npm run sde:build` picking up a new
 * moon-ore type in the SDE-derived allowlist (`sde/loadSde.loadMoonOreTypeIds`)
 * — a data-correction workaround, not Editable Data worth syncing across
 * devices.
 */
import { db } from '@/db';

const SETTINGS_KEY = 'miningTax.manualMoonOreTypeIds';

export async function loadManualMoonOreTypeIds(): Promise<number[]> {
  const record = await db.settings.get(SETTINGS_KEY);
  return Array.isArray(record?.value) ? (record.value as number[]) : [];
}

/** Tags `typeId` as moon ore from now on — future ledger refreshes group it into entries instead of flagging it. */
export async function tagAsMoonOre(typeId: number): Promise<void> {
  const existing = await loadManualMoonOreTypeIds();
  if (existing.includes(typeId)) return;
  await db.settings.put({ key: SETTINGS_KEY, value: [...existing, typeId] });
}
