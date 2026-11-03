/**
 * The Mining Ledger Entries a pilot unassigned (GLOSSARY.md, Default Systems): "unassign sticks",
 * so a Payee's Default Systems never assign that entry again. Deleting an Assignment leaves no
 * trace, so the entry is remembered here, as `defaultOptOutKey` strings in one synced setting
 * (a second device would otherwise assign it again). Pruned on every write to the days the
 * ledger itself still keeps, so it stays a short list.
 */
import { defaultOptOutKey } from '@/engine/miningTax/defaultSystems';
import { utcDay } from '@/engine/localDay';
import { db } from '@/db';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_DEFAULT_OPT_OUTS_KEY = 'sync.miningTaxDefaultOptOuts';

/** How long an unassign is remembered: past the ledger's own history (ESI returns 30 days, the device keeps more), nothing is left to assign. */
const KEEP_DAYS = 120;

export const useDefaultOptOuts = createSyncedSetting<string[]>({
  key: SYNCED_DEFAULT_OPT_OUTS_KEY,
  defaultValue: [],
  parse: (raw) =>
    Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : null,
});

/** The stored list, read before any write (a write before hydration would replace it with `[]`) and from Dexie, which another tab's write reaches before the store. */
async function current() {
  const state = useDefaultOptOuts.getState();
  if (!state.hydrated) await state.hydrate();
  const row = await db.settings.get(SYNCED_DEFAULT_OPT_OUTS_KEY);
  const { value, setValue } = useDefaultOptOuts.getState();
  const list = row === undefined ? value : Array.isArray(row.value) ? (row.value as string[]) : [];
  return { value: list, setValue };
}

export async function loadDefaultOptOuts(): Promise<Set<string>> {
  return new Set((await current()).value);
}

export async function recordDefaultOptOuts(
  entries: readonly { characterId: number; date: string; solarSystemId: number }[],
  nowMs = Date.now()
): Promise<void> {
  if (entries.length === 0) return;
  const { value, setValue } = await current();
  const oldest = utcDay(nowMs - KEEP_DAYS * 24 * 60 * 60 * 1000);
  const keys = new Set([
    ...value,
    ...entries.map((e) => defaultOptOutKey(e.characterId, e.date, e.solarSystemId)),
  ]);
  await setValue([...keys].filter((key) => (key.split('|')[1] ?? '') >= oldest));
}
