import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { loadAllCharacterLedgers } from './ledger';
import { recordLedgerArrivals } from './oreArrivalLog';
import { loadPayees } from './payees';
import { loadAssignments } from './assignments';
import { reconcileAssignments } from './reconcile';
import { applyDefaultSystems } from './defaultAssignments';
import { applySurveyConnections } from './surveyConnections';
import { readCompressedOre } from './oreForm';
import { repriceForOreForm } from './oreFormReprice';
import { coalesceAssignments } from './coalesce';
import { PayeeRunningAccounts } from './payeeRunningAccounts';
import {
  linksReady,
  loadRunningAccountInputs,
  loadPayeeRunningAccounts,
  readLegacyPaidMarks,
  isBookOwnedKnown,
} from './paymentLinkStore';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { computeOwnership, findDuplicateAssignmentIds } from '@/engine/miningTax/ownership';
import { entryFromAssignments } from '@/engine/miningTax/assignmentEntry';
import { entryKey, type MiningLedgerEntry } from '@/engine/miningTax/types';

export interface MoonMiningTaxRow {
  characterId: number;
  characterName: string;
  entry: MiningLedgerEntry;
  assignments: MiningTaxAssignmentRecord[];
  unassignedOreLines: MiningLedgerEntry['oreLines'];
  bookTakenOreLines?: MiningLedgerEntry['oreLines'];
  releasedOreLines?: MiningLedgerEntry['oreLines'];
  duplicateAssignmentIds?: string[];
}

export interface UnclassifiedOre {
  characterId: number;
  characterName: string;
  typeIds: number[];
}

export interface TrackedCharacter {
  characterId: number;
  characterName: string;
}

export interface MoonMiningTaxSnapshot {
  rows: MoonMiningTaxRow[];
  characters: TrackedCharacter[];
  payeesByCharacter: Map<number, PayeeRecord[]>;
  paymentLinks: PayeePaymentLink[];
  billedElsewhere: ReadonlyMap<string, number>;
  bookOwned: ReadonlySet<string>;
  unclassified: UnclassifiedOre[];
  reauthCharacters: TrackedCharacter[];
  fetchedAt: Date | null;
  fromCache: boolean;
}

export async function loadMoonMiningTaxSnapshot(): Promise<MoonMiningTaxSnapshot> {
  await readCompressedOre();
  const ledgers = await loadAllCharacterLedgers();
  await recordLedgerArrivals(ledgers);

  const ready = await linksReady(ledgers.map((l) => l.characterId));
  if (ready) {
    await readLegacyPaidMarks().catch(() => undefined);
    const ownershipKnown = await isBookOwnedKnown().catch(() => false);
    const accounts = await loadPayeeRunningAccounts();
    await Promise.all(
      ledgers.map((ledger) => coalesceAssignments(ledger.characterId, ledger.entries, accounts))
    );
    await applySurveyConnections(ledgers, Date.now(), accounts).catch(() => []);
    if (ownershipKnown) await applyDefaultSystems(ledgers, accounts).catch(() => []);
    const grown = await loadPayeeRunningAccounts();
    await Promise.all(
      ledgers
        .filter((ledger) => ledger.entries.length > 0)
        .map((ledger) => reconcileAssignments(ledger.characterId, ledger.entries, grown))
    );
    await Promise.all(ledgers.map((ledger) => repriceForOreForm(ledger.characterId, grown)));
  }

  const rows: MoonMiningTaxRow[] = [];
  const characters: TrackedCharacter[] = ledgers.map((ledger) => ({
    characterId: ledger.characterId,
    characterName: ledger.characterName,
  }));
  const payeesByCharacter = new Map<number, PayeeRecord[]>();
  const unclassified: UnclassifiedOre[] = [];
  const reauthCharacters: TrackedCharacter[] = [];
  let fetchedAt: Date | null = null;
  let fromCache = ledgers.length > 0;

  const [payeesByLedger, assignmentsByLedger, inputs] = await Promise.all([
    Promise.all(ledgers.map((ledger) => loadPayees(ledger.characterId))),
    Promise.all(ledgers.map((ledger) => loadAssignments(ledger.characterId))),
    loadRunningAccountInputs(),
  ]);
  const grown = PayeeRunningAccounts.build({
    assignments: assignmentsByLedger.flat(),
    payees: payeesByLedger.flat(),
    ...inputs,
  });

  ledgers.forEach((ledger, index) => {
    if (ledger.needsReauth) {
      reauthCharacters.push({
        characterId: ledger.characterId,
        characterName: ledger.characterName,
      });
    }
    if (ledger.fetchedAt && (!fetchedAt || ledger.fetchedAt < fetchedAt))
      fetchedAt = ledger.fetchedAt;
    if (!ledger.fromCache) fromCache = false;
    if (ledger.unclassifiedTypeIds.length > 0) {
      unclassified.push({
        characterId: ledger.characterId,
        characterName: ledger.characterName,
        typeIds: ledger.unclassifiedTypeIds,
      });
    }

    payeesByCharacter.set(ledger.characterId, payeesByLedger[index]);
    const assignments = assignmentsByLedger[index];

    const byDaySystem = new Map<string, MiningTaxAssignmentRecord[]>();
    for (const a of assignments) {
      const key = `${a.date}|${String(a.solarSystemId)}`;
      const bucket = byDaySystem.get(key);
      if (bucket) bucket.push(a);
      else byDaySystem.set(key, [a]);
    }

    for (const entry of ledger.entries) {
      const covering = byDaySystem.get(`${entry.date}|${String(entry.solarSystemId)}`) ?? [];
      const ownership = computeOwnership(
        entry.oreLines,
        covering.map((a) => grown.view(a))
      );
      rows.push({
        characterId: ledger.characterId,
        characterName: ledger.characterName,
        entry,
        assignments: covering,
        unassignedOreLines: ownership.unassigned,
        ...(ownership.released.length > 0 ? { releasedOreLines: ownership.released } : {}),
        duplicateAssignmentIds: findDuplicateAssignmentIds(entry.oreLines, covering),
      });
    }

    const freshKeys = new Set(
      ledger.entries.map((e) => entryKey(ledger.characterId, e.date, e.solarSystemId))
    );
    const agedOut = new Map<string, MiningTaxAssignmentRecord[]>();
    for (const a of assignments) {
      const key = entryKey(a.characterId, a.date, a.solarSystemId);
      if (freshKeys.has(key)) continue;
      const group = agedOut.get(key);
      if (group) group.push(a);
      else agedOut.set(key, [a]);
    }
    for (const covering of agedOut.values()) {
      const { date, solarSystemId } = covering[0];
      rows.push({
        characterId: ledger.characterId,
        characterName: ledger.characterName,
        entry: entryFromAssignments(ledger.characterId, date, solarSystemId, covering),
        assignments: covering,
        unassignedOreLines: [],
      });
    }
  });

  return {
    rows,
    characters,
    payeesByCharacter,
    paymentLinks: inputs.links,
    billedElsewhere: inputs.billedElsewhere,
    bookOwned: inputs.bookOwned,
    unclassified,
    reauthCharacters,
    fetchedAt,
    fromCache,
  };
}
