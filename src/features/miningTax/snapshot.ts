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
import {
  statusesForRow,
  unassignedOreLines,
  type MiningTaxRowStatus,
} from '@/engine/miningTax/rowStatus';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';

export interface MoonMiningTaxRow {
  characterId: number;
  characterName: string;
  entry: MiningLedgerEntry;
  /** Assignments covering some or all of this entry's ore — 0, 1 (the common case), or 2+ for a split. */
  assignments: MiningTaxAssignmentRecord[];
  /** Ore this entry's assignments don't yet cover. */
  unassignedOreLines: MiningLedgerEntry['oreLines'];
  /** Every status present on this row — see `engine/miningTax/rowStatus.ts`. */
  statuses: Set<MiningTaxRowStatus>;
}

export interface UnclassifiedOre {
  characterId: number;
  characterName: string;
  typeIds: number[];
}

export interface MoonMiningTaxSnapshot {
  rows: MoonMiningTaxRow[];
  payeesByCharacter: Map<number, PayeeRecord[]>;
  unclassified: UnclassifiedOre[];
  /** True when any tracked character's ledger read needed a re-login. */
  needsReauth: boolean;
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
  const payeesByCharacter = new Map<number, PayeeRecord[]>();
  const unclassified: UnclassifiedOre[] = [];
  let needsReauth = false;
  let fetchedAt: Date | null = null;
  let fromCache = ledgers.length > 0;

  for (const ledger of ledgers) {
    needsReauth = needsReauth || ledger.needsReauth;
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

    payeesByCharacter.set(ledger.characterId, await loadPayees(ledger.characterId));
    // Reloaded after reconcile so a fresh needs-review flip is reflected.
    const assignments = await loadAssignments(ledger.characterId);

    for (const entry of ledger.entries) {
      const covering = assignments.filter(
        (a) => a.date === entry.date && a.solarSystemId === entry.solarSystemId
      );
      rows.push({
        characterId: ledger.characterId,
        characterName: ledger.characterName,
        entry,
        assignments: covering,
        unassignedOreLines: unassignedOreLines(
          entry.oreLines,
          covering.map((a) => a.oreLines)
        ),
        statuses: statusesForRow(
          entry.oreLines,
          covering.map((a) => ({ status: a.status, oreLines: a.oreLines }))
        ),
      });
    }
  }

  return { rows, payeesByCharacter, unclassified, needsReauth, fetchedAt, fromCache };
}
