import { defaultOptOutDate, defaultOptOutKey } from '@/engine/miningTax/defaultSystems';
import { utcDay } from '@/engine/localDay';
import { db } from '@/db';
import { DAY_MS } from '@/lib/age';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_DEFAULT_OPT_OUTS_KEY = 'sync.miningTaxDefaultOptOuts';

const KEEP_DAYS = 120;

export const useDefaultOptOuts = createSyncedSetting<string[]>({
  key: SYNCED_DEFAULT_OPT_OUTS_KEY,
  defaultValue: [],
  parse: (raw) =>
    Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : null,
});

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
  const oldest = utcDay(nowMs - KEEP_DAYS * DAY_MS);
  const keys = new Set([
    ...value,
    ...entries.map((e) => defaultOptOutKey(e.characterId, e.date, e.solarSystemId)),
  ]);
  await setValue([...keys].filter((key) => defaultOptOutDate(key) >= oldest));
}
