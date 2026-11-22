/**
 * Composes the Moon Mining Tax ledger's one page (issue #523): every tracked
 * character's Mining Ledger Entries, joined against their Payees and
 * Assignments, re-diffed for `needs-review` on the way in.
 */
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
  /** Assignments covering some or all of this entry's ore — 0, 1 (the common case), or 2+ for a split. */
  assignments: MiningTaxAssignmentRecord[];
  /** Ore this entry's assignments don't yet cover. */
  unassignedOreLines: MiningLedgerEntry['oreLines'];
  /**
   * Free ore the Corp Tax Books took off `unassignedOreLines` (`buildDisplayRows`): the ledger still
   * reports it, so a new Assignment must remember it (`releasedTypeIds`) or it grows straight back in.
   */
  bookTakenOreLines?: MiningLedgerEntry['oreLines'];
  /** Assignments that look like one obligation stored twice over this entry — see `findDuplicateAssignmentIds`. Empty for a healthy row. */
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
  /**
   * Every tracked character, regardless of whether it has any Mining Ledger
   * Entries this refresh — the Characters filter and Manage Payees need the
   * whole roster, not just whoever happens to have mined moon goo lately, or
   * a character with zero entries this cycle is invisible to both.
   */
  characters: TrackedCharacter[];
  payeesByCharacter: Map<number, PayeeRecord[]>;
  /** Every Made Payment linked to a Payee, whichever Character's: it pays that Payee's oldest days. */
  paymentLinks: PayeePaymentLink[];
  /** What the Corp Tax Books bill too, by Assignment id, as last seen (`saveBilledElsewhere`). */
  billedElsewhere: ReadonlyMap<string, number>;
  unclassified: UnclassifiedOre[];
  /**
   * Tracked characters whose ledger read needed a re-login this refresh —
   * per character, not one flag OR'd across all of them, so a single lapsed
   * alt's obligation cannot go missing behind the other characters' data
   * looking fine (GLOSSARY.md: "the point of the feature is not missing an
   * alt's obligation").
   */
  reauthCharacters: TrackedCharacter[];
  /** Oldest `fetchedAt` among characters with cached data — the page's Data Age badge is only as fresh as its stalest character. */
  fetchedAt: Date | null;
  /** True when every ledger read was cache-only (offline). */
  fromCache: boolean;
}

export async function loadMoonMiningTaxSnapshot(): Promise<MoonMiningTaxSnapshot> {
  // Hydrates the Ore Form setting before anything below prices or re-prices.
  await readCompressedOre();
  const ledgers = await loadAllCharacterLedgers();
  // Settle up's "Ore still arriving" line reads growth between loads.
  await recordLedgerArrivals(ledgers);

  // Nothing here changes an Assignment before the links are known: a device that has not pulled
  // them yet would read a day paid elsewhere as unpaid (decision 20261120-235011).
  const ready = await linksReady(ledgers.map((l) => l.characterId));
  if (ready) {
    // First of all: a paid mark an older client wrote becomes the link it stands for, so every
    // step below reads Paid off the Payees' accounts.
    await readLegacyPaidMarks().catch(() => undefined);
    // Before reconcile, not after: reconcile's growth diff is defined per Mining Ledger Entry over
    // the Assignments covering it, so it has to see one fused record rather than two halves of
    // the same obligation. The fresh entries are passed only so it can tell a split day from an
    // exact duplicate (and leave an unverifiable pair alone).
    // Read before the accounts, never after: a known ownership set is never unknown again, so the
    // accounts read next hold a set at least as new, and a book's own Payee is never planned.
    const ownershipKnown = await isBookOwnedKnown().catch(() => false);
    const accounts = await loadPayeeRunningAccounts();
    await Promise.all(
      ledgers.map((ledger) => coalesceAssignments(ledger.characterId, ledger.entries, accounts))
    );
    // Before reconcile too: a connected moon Survey's ore must become its own Assignment (the
    // entry's growth collector) before reconcile folds it into an earlier moon's Assignment on
    // the same day and system.
    await applySurveyConnections(ledgers, Date.now(), accounts).catch(() => []);
    // Last resort, after the Survey has had first claim: a Payee's Default Systems assign what
    // nothing else has touched.
    // Only once the books' ownership has been stored: until then a book's own Payee is not known
    // to be one, and must not be given an Assignment (the Tax tab stores it on its first load).
    if (ownershipKnown) await applyDefaultSystems(ledgers, accounts).catch(() => []);
    // Read again: a Survey or a Default System may have billed a paid day anew.
    const grown = await loadPayeeRunningAccounts();
    await Promise.all(
      ledgers
        .filter((ledger) => ledger.entries.length > 0)
        .map((ledger) => reconcileAssignments(ledger.characterId, ledger.entries, grown))
    );
    // Not gated on a non-empty ledger: it works from stored Assignments alone.
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

  // Payees + Assignments reads are fanned out across every character at once
  // (Dexie reads, not ESI — no fan-out cap needed) rather than one character
  // awaited at a time, matching `ledger.ts`'s own fan-out for the ESI half.
  const [payeesByLedger, assignmentsByLedger, inputs] = await Promise.all([
    Promise.all(ledgers.map((ledger) => loadPayees(ledger.characterId))),
    // Reloaded after reconcile so a fresh needs-review flip is reflected.
    Promise.all(ledgers.map((ledger) => loadAssignments(ledger.characterId))),
    loadRunningAccountInputs(),
  ]);
  // The accounts every reader of this snapshot shares (`PayeeRunningAccounts.build`).
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

    // One pass instead of a scan of every Assignment per entry.
    const byDaySystem = new Map<string, MiningTaxAssignmentRecord[]>();
    for (const a of assignments) {
      const key = `${a.date}|${String(a.solarSystemId)}`;
      const bucket = byDaySystem.get(key);
      if (bucket) bucket.push(a);
      else byDaySystem.set(key, [a]);
    }

    for (const entry of ledger.entries) {
      const covering = byDaySystem.get(`${entry.date}|${String(entry.solarSystemId)}`) ?? [];
      rows.push({
        characterId: ledger.characterId,
        characterName: ledger.characterName,
        entry,
        assignments: covering,
        // A paid day never grows (ADR 0024): read Paid off its Payee's account.
        unassignedOreLines: computeOwnership(
          entry.oreLines,
          covering.map((a) => grown.view(a))
        ).unassigned,
        duplicateAssignmentIds: findDuplicateAssignmentIds(entry.oreLines, covering),
      });
    }

    // ESI only returns ~30 days, so an Assignment can outlive its entry (or
    // its character's ledger read can fail with nothing cached). Its row
    // stays, rebuilt from the Assignments' own stored ore, so the bill neither
    // vanishes from the table nor drops out of the Owed balances.
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
    unclassified,
    reauthCharacters,
    fetchedAt,
    fromCache,
  };
}
