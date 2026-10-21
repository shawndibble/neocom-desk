/**
 * Survey connections (issue #4684): the store and the writes behind "Manage
 * Taxes" on a moon Survey. A connection ties one Survey's moon to its Payee
 * and rate for one Character; while it is live, `applySurveyConnections`
 * assigns that moon's ore as it reaches the Mining Ledger (the planning is
 * `engine/miningTax/surveyConnection.ts`).
 *
 * Kept as one synced setting, so a second device keeps assigning the same
 * moon: a list of at most a handful of short-lived records, pruned on every
 * write, needs no collection of its own (and no Firestore rules change).
 *
 * Runs from the Tax tab's load (`snapshot.ts`) and from the Survey while it
 * is open (`useSurveyConnection`), so ore is assigned whichever the pilot is
 * looking at.
 */
import { db, type MiningTaxAssignmentRecord } from '@/db';
import {
  isConnectionLive,
  parseSurveyConnections,
  planSurveyAutoAssign,
  upsertSurveyConnection,
  type SurveyConnection,
} from '@/engine/miningTax/surveyConnection';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { assign } from './ledgerActions';
import { loadAllCharacterLedgers } from './ledger';
import { readCompressedOre } from './oreForm';
import { loadPayees } from './payees';
import { hubForPayee, loadUnitPricesOnDate } from './pricing';

export const SYNCED_SURVEY_CONNECTIONS_KEY = 'sync.miningTaxSurveyConnections';

export const useSurveyConnections = createSyncedSetting<SurveyConnection[]>({
  key: SYNCED_SURVEY_CONNECTIONS_KEY,
  defaultValue: [],
  parse: parseSurveyConnections,
});

/** The stored list, read before any write: a write before hydration would replace it with `[]`. */
async function current(): Promise<ReturnType<typeof useSurveyConnections.getState>> {
  if (!useSurveyConnections.getState().hydrated) await useSurveyConnections.getState().hydrate();
  return useSurveyConnections.getState();
}

export async function saveSurveyConnection(connection: SurveyConnection): Promise<void> {
  const { value, setValue } = await current();
  await setValue(upsertSurveyConnection(value, connection, Date.now()));
}

export async function removeSurveyConnection(surveyId: string, characterId: number): Promise<void> {
  const { value, setValue } = await current();
  await setValue(value.filter((c) => !(c.surveyId === surveyId && c.characterId === characterId)));
}

/**
 * Assigns, for each ledger, what its Character's live connections plan, one
 * Assignment per slice, each priced at its Payee's hub on the mined date.
 * Resolves to the Assignments made; a slice that fails to price or save is
 * skipped, and tried again on the next load.
 */
export async function applySurveyConnections(
  ledgers: readonly { characterId: number; entries: readonly MiningLedgerEntry[] }[],
  nowMs = Date.now()
): Promise<MiningTaxAssignmentRecord[]> {
  const live = (await current()).value.filter((c) => isConnectionLive(c, nowMs));
  if (live.length === 0) return [];
  const created: MiningTaxAssignmentRecord[] = [];
  for (const ledger of ledgers) {
    const connections = live.filter((c) => c.characterId === ledger.characterId);
    if (connections.length === 0 || ledger.entries.length === 0) continue;
    const [assignments, payees] = await Promise.all([
      db.miningTaxAssignments.where('characterId').equals(ledger.characterId).toArray(),
      loadPayees(ledger.characterId),
    ]);
    const slices = planSurveyAutoAssign(ledger.entries, assignments, connections, nowMs);
    if (slices.length === 0) continue;
    const compressed = await readCompressedOre();
    for (const slice of slices) {
      const payee = payees.find((p) => p.id === slice.connection.payeeId);
      if (!payee) continue;
      try {
        const { prices } = await loadUnitPricesOnDate(
          slice.oreLines.map((line) => line.typeId),
          hubForPayee(payee.hubId),
          slice.date,
          compressed
        );
        const value = computeAssignmentValue(slice.oreLines, prices, slice.connection.taxPct);
        const result = await assign({
          characterId: slice.characterId,
          date: slice.date,
          solarSystemId: slice.solarSystemId,
          payeeId: payee.id,
          oreLines: slice.oreLines,
          entryOreLines: slice.entryOreLines,
          taxPct: slice.connection.taxPct,
          estimatedValue: value.estimatedValue,
          taxOwed: value.taxOwed,
          markPaid: false,
          takesGrowth: true,
        });
        if (result.ok) created.push(result.value);
      } catch {
        // No prices yet (offline): the next load tries again.
      }
    }
  }
  return created;
}

/** Reads every Character's ledger and applies the live connections — for the Survey, which has no snapshot of its own. */
export async function autoAssignFromSurveys(): Promise<MiningTaxAssignmentRecord[]> {
  const live = (await current()).value.filter((c) => isConnectionLive(c, Date.now()));
  if (live.length === 0) return [];
  return applySurveyConnections(await loadAllCharacterLedgers());
}
