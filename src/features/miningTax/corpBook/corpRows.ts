/**
 * Folds the engine's overlay (`overlayCorpBooks`) into the Tax tab's own row
 * model (#4065): the personal rows with the ore a book took removed from their
 * unassigned residual, plus one synthetic `DisplayRow` per decision the book
 * made, owed to a virtual Payee named for the corporation. Nothing here is
 * written to Dexie: the synthetic rows are display-only, and the tab keeps
 * every write action away from them (`DisplayRow.corp`).
 */
import type { MiningTaxAssignmentRecord, MiningTaxAssignmentStatus, PayeeRecord } from '@/db';
import type {
  BookLabelState,
  BookRowView,
  PersonalEntry,
  PersonalOverlay,
} from '@/engine/corpTaxBook/personal';
import { isDefaultAssigned } from '@/engine/miningTax/defaultSystems';
import { entryKey, type OreLine } from '@/engine/miningTax/types';
import { flatten, type DisplayRow } from '../groupRows';
import type { MoonMiningTaxRow } from '../snapshot';

/** What a Tax-tab row knows about the Corp Tax Book it came from. */
export type CorpRowInfo =
  | { kind: 'row'; view: BookRowView; corpName: string }
  | { kind: 'label'; state: BookLabelState; corporationId: number; corpName: string };

export const CORP_PAYEE_PREFIX = 'corp-book:';

export const corpPayeeId = (corporationId: number) => `${CORP_PAYEE_PREFIX}${corporationId}`;
export const isCorpPayeeId = (payeeId: string | undefined): payeeId is string =>
  payeeId?.startsWith(CORP_PAYEE_PREFIX) === true;
export const corporationOfPayee = (payeeId: string): number =>
  Number(payeeId.slice(CORP_PAYEE_PREFIX.length));

/** A stored Payee verified as this corporation (its entity id), never one that only shares its name. */
export const isCorpEntityPayee = (payee: PayeeRecord, corporationId: number): boolean =>
  payee.entityKind === 'corporation' && payee.entityId === corporationId;

/**
 * Each book's virtual Payee mapped to the stored Payee that is the same corporation, so the Payee
 * filter lists the corporation once and a pick covers both sets of rows.
 */
export function corpPayeeAliases(
  storedPayees: readonly PayeeRecord[],
  bookPayees: readonly PayeeRecord[]
): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const book of bookPayees) {
    const mine = storedPayees.find(
      (p) => book.entityId !== undefined && isCorpEntityPayee(p, book.entityId)
    );
    if (mine) aliases.set(book.id, mine.id);
  }
  return aliases;
}

/**
 * What the day is worth in tax, as every other row on the page reads it: the bill for a Paid day
 * (after any correction), what is still owed while Billed, and 0 only where the corporation
 * dismissed or waived it. The engine zeroes `taxOwed` once paid, so Paid reads the bill instead.
 */
export const bookRowTax = (view: BookRowView): number =>
  view.state === 'paid' ? (view.correction?.after ?? view.billed) : (view.taxOwed ?? 0);

/** The row is one the book decided (not a personal row relabelled). */
export const isBookRow = (dr: DisplayRow): boolean => dr.corp?.kind === 'row';

/** The synthetic Payee a book's rows are owed to: terms locked to the book, so never editable or assignable. */
export function corpPayee(
  corporationId: number,
  characterId: number,
  name: string,
  taxPct: number,
  hubId: string
): PayeeRecord {
  return {
    id: corpPayeeId(corporationId),
    characterId,
    name,
    defaultTaxPct: taxPct,
    hubId,
    entityId: corporationId,
    entityKind: 'corporation',
    updatedAt: 0,
  };
}

const STATUS_OF_STATE: Record<BookRowView['state'], MiningTaxAssignmentStatus> = {
  billed: 'outstanding',
  // Visible and not owed: it needs a decision, but not the member's money.
  conflict: 'needs-review',
  paid: 'paid',
  dismissed: 'dismissed',
  // Forgiven in full by an officer write-off (#4637): not owed, like a dismissal.
  waived: 'dismissed',
};

function minusLines(from: readonly OreLine[], take: readonly OreLine[] | undefined): OreLine[] {
  if (!take) return [...from];
  const gone = new Map(take.map((l) => [l.typeId, l.quantity]));
  return from
    .map((l) => ({ typeId: l.typeId, quantity: l.quantity - (gone.get(l.typeId) ?? 0) }))
    .filter((l) => l.quantity > 0);
}

function syntheticRow(view: BookRowView, characterName: string, corpName: string): DisplayRow {
  const assignment: MiningTaxAssignmentRecord = {
    id: view.id,
    characterId: view.characterId,
    date: view.date,
    solarSystemId: view.solarSystemId,
    payeeId: corpPayeeId(view.corporationId),
    oreLines: view.oreLines,
    taxPct: view.taxPct,
    estimatedValue: view.estimatedValue,
    taxOwed: bookRowTax(view),
    status: STATUS_OF_STATE[view.state],
    // The refinery, read beside the corporation in the Payee column (spec #4504).
    ...(view.refineryLabel ? { label: view.refineryLabel } : {}),
    updatedAt: 0,
  };
  const row: MoonMiningTaxRow = {
    characterId: view.characterId,
    characterName,
    entry: {
      characterId: view.characterId,
      date: view.date,
      solarSystemId: view.solarSystemId,
      oreLines: view.oreLines,
    },
    assignments: [assignment],
    unassignedOreLines: [],
  };
  return {
    key: view.id,
    row,
    assignment,
    status: assignment.status,
    corp: { kind: 'row', view, corpName },
  };
}

/**
 * The tab's rows: with no overlay exactly `flatten(entries)`. With one, the
 * entries lose the free ore the books took, their remaining unassigned rows
 * carry a Pending / Unattributed label, and the books' own rows are added.
 */
export function buildDisplayRows(
  entries: readonly MoonMiningTaxRow[],
  overlay: PersonalOverlay | null,
  characterNameOf: (characterId: number) => string
): DisplayRow[] {
  if (!overlay) return flatten(entries);
  const adjusted = entries.map((row) => {
    const taken = overlay.takenFromFree.get(
      entryKey(row.characterId, row.entry.date, row.entry.solarSystemId)
    );
    return taken ? { ...row, unassignedOreLines: minusLines(row.unassignedOreLines, taken) } : row;
  });
  // A Payee that is the corporation: its rows give way to the book's, which bills the same ore.
  const taken = (dr: DisplayRow) =>
    dr.assignment != null &&
    overlay.absorbed
      .get(entryKey(dr.row.characterId, dr.row.entry.date, dr.row.entry.solarSystemId))
      ?.has(dr.assignment.id) === true;
  const flat = flatten(adjusted)
    .filter((dr) => !taken(dr))
    .map((dr): DisplayRow => {
      if (dr.assignment) return dr;
      const label = overlay.labels.get(
        entryKey(dr.row.characterId, dr.row.entry.date, dr.row.entry.solarSystemId)
      );
      return label
        ? {
            ...dr,
            corp: {
              kind: 'label',
              state: label.state,
              corporationId: label.corporationId,
              corpName: label.corpName,
            },
          }
        : dr;
    });
  const own = overlay.rows.map((view) =>
    syntheticRow(view, characterNameOf(view.characterId), view.corpName)
  );
  return [...flat, ...own];
}

/** The engine's view of the member's Mining Ledger Entries. */
export function personalEntriesOf(rows: readonly MoonMiningTaxRow[]): PersonalEntry[] {
  return rows.map((row) => ({
    characterId: row.characterId,
    date: row.entry.date,
    solarSystemId: row.entry.solarSystemId,
    oreLines: row.entry.oreLines,
    freeOreLines: row.unassignedOreLines,
    // A dismissed Assignment ("I don't pay tax on this") has no rate to compare.
    allocations: row.assignments
      .filter((a) => a.status !== 'dismissed')
      .map((a) => ({
        id: a.id,
        payeeId: a.payeeId ?? '',
        taxPct: a.taxPct,
        oreLines: a.oreLines,
        status: a.status,
        // A Default System's unpaid Assignment is ore given to no Payee as far as the book goes.
        ...(isDefaultAssigned(a) && a.status === 'outstanding' ? { releasable: true } : {}),
      })),
  }));
}
