import { createLocalSetting } from '@/lib/useLocalSetting';
import {
  EMPTY_ORE_ARRIVAL_LOG,
  recordLedgerFetch,
  type OreArrivalLog,
} from '@/engine/miningTax/oreArrival';
import type { CharacterMiningLedger } from './ledger';
import { isPlainRecord } from '@/engine/guards';

export const useOreArrivalLog = createLocalSetting<OreArrivalLog>({
  key: 'miningTaxOreArrivals',
  defaultValue: EMPTY_ORE_ARRIVAL_LOG,
  parse: (raw) =>
    isPlainRecord(raw) &&
    isPlainRecord(raw.entries) &&
    Object.values(raw.entries).every(
      (entry) => isPlainRecord(entry) && isPlainRecord(entry.ores)
    ) &&
    isPlainRecord(raw.checkedAt)
      ? (raw as unknown as OreArrivalLog)
      : null,
});

export async function recordLedgerArrivals(
  ledgers: readonly CharacterMiningLedger[]
): Promise<void> {
  try {
    await useOreArrivalLog.getState().hydrate();
    const before = useOreArrivalLog.getState().value;
    let log = before;
    for (const ledger of ledgers) {
      if (!ledger.fetchedAt) continue;
      log = recordLedgerFetch(
        log,
        ledger.characterId,
        ledger.entries.map((entry) => ({
          date: entry.date,
          solarSystemId: entry.solarSystemId,
          oreLines: entry.oreLines,
        })),
        ledger.fetchedAt.getTime()
      );
    }
    if (log !== before) await useOreArrivalLog.getState().setValue(log);
  } catch {}
}
