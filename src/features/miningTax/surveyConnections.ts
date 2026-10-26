/**
 * Survey connections (issue #4684): the store and the writes behind "Manage
 * Taxes" on a moon Survey. A connection ties one Survey's moon to its Payee
 * and rate for one Character; while it is live, `applySurveyConnections`
 * assigns that moon's ore as it reaches the Mining Ledger (the planning is
 * `engine/miningTax/surveyConnection.ts`).
 *
 * Kept as one synced setting, so a second device keeps assigning the same
 * moon: a list of short-lived records (one, since only one Auto Assignment
 * runs at a time), pruned on every write, needs no collection of its own (and
 * no Firestore rules change).
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
  updateSurveyConnection,
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
import { reconcileAssignments } from './reconcile';
import { loadManualMoonOreTypeIds } from './typeOverrides';
import { loadMoonOreTypeIds, loadTypes } from '@/sde/loadSde';

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

async function liveConnections(nowMs: number): Promise<SurveyConnection[]> {
  return (await current()).value.filter((c) => isConnectionLive(c, nowMs));
}

/**
 * The moon ore type ids among a Survey's scanner ore names (raw names, the
 * ledger's type ids): the SDE's moon ores plus any the pilot tagged as moon
 * ore, the same set the ledger groups into entries (`ledger.ts`).
 */
export async function surveyMoonOreTypeIds(oreNames: readonly string[]): Promise<number[]> {
  const [moonIds, tagged, types] = await Promise.all([
    loadMoonOreTypeIds(),
    loadManualMoonOreTypeIds(),
    loadTypes(),
  ]);
  const wanted = new Set(oreNames);
  return [...new Set([...moonIds, ...tagged])]
    .filter((id) => wanted.has(types[String(id)]?.name ?? ''))
    .sort((a, b) => a - b);
}

/**
 * Starts `connection` as the only one: one Auto Assignment runs at a time, on
 * any Character, so Assign Taxes stops whichever was running. Resolves to the
 * live connections it replaced, for Undo (`restoreSurveyConnections`).
 */
export async function startSurveyConnection(
  connection: SurveyConnection
): Promise<SurveyConnection[]> {
  const { value, setValue } = await current();
  const replaced = value.filter((c) => isConnectionLive(c, Date.now()));
  await setValue([connection]);
  return replaced;
}

/** Saves a running connection as its Survey moves on; does nothing once it was stopped or replaced. */
export async function refreshSurveyConnection(connection: SurveyConnection): Promise<void> {
  const { value, setValue } = await current();
  await setValue(updateSurveyConnection(value, connection, Date.now()));
}

/** Puts the connections back as they were, for Undo of `startSurveyConnection`. */
export async function restoreSurveyConnections(
  connections: readonly SurveyConnection[]
): Promise<void> {
  await (await current()).setValue([...connections]);
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
  const live = await liveConnections(nowMs);
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
          label: slice.label,
        });
        if (result.ok) created.push(result.value);
      } catch {
        // No prices yet (offline): the next load tries again.
      }
    }
  }
  return created;
}

/**
 * Reads every Character's ledger and applies the live connections — for the
 * Survey, which has no snapshot of its own. Then reconciles those Characters,
 * as the Tax tab's load would, so growth a connection leaves to its own
 * earlier Assignment is folded in now rather than on the next Tax tab visit.
 */
export async function autoAssignFromSurveys(): Promise<MiningTaxAssignmentRecord[]> {
  const live = await liveConnections(Date.now());
  if (live.length === 0) return [];
  const connected = new Set(live.map((c) => c.characterId));
  const ledgers = (await loadAllCharacterLedgers()).filter((l) => connected.has(l.characterId));
  const created = await applySurveyConnections(ledgers);
  await Promise.all(
    ledgers
      .filter((ledger) => ledger.entries.length > 0)
      .map((ledger) => reconcileAssignments(ledger.characterId, ledger.entries))
  );
  return created;
}
