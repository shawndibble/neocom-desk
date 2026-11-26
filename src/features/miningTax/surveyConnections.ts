import { db, type MiningTaxAssignmentRecord, type MiningTaxOreLine } from '@/db';
import { isUnpaidDefault } from '@/engine/miningTax/defaultSystems';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';
import { loadPayeeRunningAccounts } from './paymentLinkStore';
import {
  isConnectionLive,
  parseSurveyConnections,
  planSurveyAutoAssign,
  updateSurveyConnection,
  type SurveyConnection,
  type Takeover,
} from '@/engine/miningTax/surveyConnection';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { assign, releaseOre } from './ledgerActions';
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

async function current(): Promise<{
  value: SurveyConnection[];
  setValue: (value: SurveyConnection[]) => Promise<void>;
}> {
  const state = useSurveyConnections.getState();
  if (!state.hydrated) await state.hydrate();
  const row = await db.settings.get(SYNCED_SURVEY_CONNECTIONS_KEY);
  const { value, setValue } = useSurveyConnections.getState();
  return { value: row === undefined ? value : (parseSurveyConnections(row.value) ?? []), setValue };
}

async function liveConnections(nowMs: number): Promise<SurveyConnection[]> {
  return (await current()).value.filter((c) => isConnectionLive(c, nowMs));
}

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

export async function startSurveyConnection(
  connection: SurveyConnection
): Promise<SurveyConnection[]> {
  const { value, setValue } = await current();
  const replaced = value.filter((c) => isConnectionLive(c, Date.now()));
  await setValue([connection]);
  return replaced;
}

export async function refreshSurveyConnection(connection: SurveyConnection): Promise<void> {
  const { value, setValue } = await current();
  await setValue(updateSurveyConnection(value, connection, Date.now()));
}

const sameStart = (a: SurveyConnection, b: SurveyConnection) =>
  a.surveyId === b.surveyId && a.characterId === b.characterId && a.connectedAt === b.connectedAt;

export async function restoreSurveyConnections(
  connections: readonly SurveyConnection[],
  started: SurveyConnection | null
): Promise<void> {
  const { value, setValue } = await current();
  if (started !== null && !value.some((c) => sameStart(c, started))) return;
  await setValue([...connections]);
}

export async function removeSurveyConnection(surveyId: string, characterId: number): Promise<void> {
  const { value, setValue } = await current();
  await setValue(value.filter((c) => !(c.surveyId === surveyId && c.characterId === characterId)));
}

export async function applySurveyConnections(
  ledgers: readonly { characterId: number; entries: readonly MiningLedgerEntry[] }[],
  nowMs = Date.now(),
  accounts?: PayeeRunningAccounts
): Promise<MiningTaxAssignmentRecord[]> {
  const live = await liveConnections(nowMs);
  if (live.length === 0) return [];
  const paid = accounts ?? (await loadPayeeRunningAccounts());
  const created: MiningTaxAssignmentRecord[] = [];
  for (const ledger of ledgers) {
    const connections = live.filter((c) => c.characterId === ledger.characterId);
    if (connections.length === 0 || ledger.entries.length === 0) continue;
    const [assignments, payees] = await Promise.all([
      db.miningTaxAssignments.where('characterId').equals(ledger.characterId).toArray(),
      loadPayees(ledger.characterId),
    ]);
    const slices = planSurveyAutoAssign(
      ledger.entries,
      assignments.map((a) => paid.view(a)),
      connections,
      nowMs
    );
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
        if (!(await takeOverFromDefaults(slice.takeovers, paid))) continue;
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
          takesGrowth: true,
          label: slice.label,
          isPaid: (a) => paid.isPaid(a),
        });
        if (result.ok) created.push(result.value);
      } catch {}
    }
  }
  return created;
}

export async function takeOverFromDefaults(
  takeovers: readonly Takeover[],
  paid: PayeeRunningAccounts
): Promise<boolean> {
  const releases: { assignment: MiningTaxAssignmentRecord; after: MiningTaxOreLine[] }[] = [];
  for (const takeover of takeovers) {
    const assignment = await db.miningTaxAssignments.get(takeover.assignmentId);
    if (!assignment || !isUnpaidDefault(paid.view(assignment))) {
      continue;
    }
    releases.push({
      assignment,
      after: assignment.oreLines.filter((l) => !takeover.typeIds.includes(l.typeId)),
    });
  }
  if (releases.length === 0) return true;
  return (await releaseOre(releases, true)).ok;
}

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
