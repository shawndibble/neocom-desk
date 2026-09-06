/**
 * Composes the Moon Mining Tax ledger's one page (issue #523): every tracked
 * character's Mining Ledger Entries, joined against their Payees and
 * Assignments, re-diffed for `needs-review` on the way in.
 */
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { loadAllCharacterLedgers } from './ledger';
import { loadPayees } from './payees';
import { loadAssignments } from './assignments';
import { reconcileAssignments } from './reconcile';
import { computeOwnership } from '@/engine/miningTax/ownership';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';

export interface MoonMiningTaxRow {
  characterId: number;
  characterName: string;
  entry: MiningLedgerEntry;
  /** Assignments covering some or all of this entry's ore — 0, 1 (the common case), or 2+ for a split. */
  assignments: MiningTaxAssignmentRecord[];
  /** Ore this entry's assignments don't yet cover. */
  unassignedOreLines: MiningLedgerEntry['oreLines'];
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
  /**
   * Every tracked character, regardless of whether it has any Mining Ledger
   * Entries this refresh — the Characters filter and Manage Payees need the
   * whole roster, not just whoever happens to have mined moon goo lately, or
   * a character with zero entries this cycle is invisible to both.
   */
  characters: TrackedCharacter[];
  payeesByCharacter: Map<number, PayeeRecord[]>;
  unclassified: UnclassifiedOre[];
  /**
   * Tracked characters whose ledger read needed a re-login this refresh —
   * per character, not one flag OR'd across all of them, so a single lapsed
   * alt's obligation cannot go missing behind the other characters' data
   * looking fine (CONTEXT.md: "the point of the feature is not missing an
   * alt's obligation").
   */
  reauthCharacters: TrackedCharacter[];
  /** Oldest `fetchedAt` among characters with cached data — the page's Data Age badge is only as fresh as its stalest character. */
  fetchedAt: Date | null;
  /** True when every ledger read was cache-only (offline). */
  fromCache: boolean;
}

export async function loadMoonMiningTaxSnapshot(): Promise<MoonMiningTaxSnapshot> {
  const ledgers = await loadAllCharacterLedgers();

  await Promise.all(
    ledgers
      .filter((ledger) => ledger.entries.length > 0)
      .map((ledger) => reconcileAssignments(ledger.characterId, ledger.entries))
  );

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

  // Payees + Assignments reads are fanned out across every character at once
  // (Dexie reads, not ESI — no fan-out cap needed) rather than one character
  // awaited at a time, matching `ledger.ts`'s own fan-out for the ESI half.
  const [payeesByLedger, assignmentsByLedger] = await Promise.all([
    Promise.all(ledgers.map((ledger) => loadPayees(ledger.characterId))),
    // Reloaded after reconcile so a fresh needs-review flip is reflected.
    Promise.all(ledgers.map((ledger) => loadAssignments(ledger.characterId))),
  ]);

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

    for (const entry of ledger.entries) {
      const covering = assignments.filter(
        (a) => a.date === entry.date && a.solarSystemId === entry.solarSystemId
      );
      rows.push({
        characterId: ledger.characterId,
        characterName: ledger.characterName,
        entry,
        assignments: covering,
        unassignedOreLines: computeOwnership(entry.oreLines, covering).unassigned,
      });
    }
  });

  return {
    rows,
    characters,
    payeesByCharacter,
    unclassified,
    reauthCharacters,
    fetchedAt,
    fromCache,
  };
}
