/**
 * The device-kept record behind Settle up's "Ore still arriving" line
 * (`engine/miningTax/oreArrival.ts`): each recent entry's last known total and
 * when this device first saw it grow. Local, not synced — it is only what this
 * device happened to observe, and another device's fetches would make the
 * growth times wrong for this one. Holds today's and yesterday's entries only,
 * so it stays a few rows.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import {
  EMPTY_ORE_ARRIVAL_LOG,
  recordLedgerFetch,
  type OreArrivalLog,
} from '@/engine/miningTax/oreArrival';
import type { CharacterMiningLedger } from './ledger';

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

export const useOreArrivalLog = createLocalSetting<OreArrivalLog>({
  key: 'miningTaxOreArrivals',
  defaultValue: EMPTY_ORE_ARRIVAL_LOG,
  // Its own record, never edited by hand: a shape check is enough to fall
  // back to empty after a format change rather than crash.
  parse: (raw) =>
    isRecord(raw) && isRecord(raw.entries) && isRecord(raw.checkedAt)
      ? (raw as unknown as OreArrivalLog)
      : null,
});

/**
 * Folds a ledger load into the log — every character whose fetch is newer than
 * the last one recorded. Never throws: this is a side record, and a failed
 * write (storage full, private browsing) must not fail the Tax tab's load. The
 * store applies the new log in memory before it writes, so this session still
 * has it.
 */
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
          quantity: entry.oreLines.reduce((sum, line) => sum + line.quantity, 0),
        })),
        ledger.fetchedAt.getTime()
      );
    }
    if (log !== before) await useOreArrivalLog.getState().setValue(log);
  } catch {
    // Settle up then has less to compare against: it falls back to small print.
  }
}
