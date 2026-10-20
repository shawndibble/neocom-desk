/**
 * The member's side of a Corp Tax Book (issue #4065, D12, D24, D28, D30): how
 * the Mining Ledger Entries on the personal Moon Mining Tax tab meet what the
 * corporation's book observed and decided. Pure — the caller loads the book's
 * own lines (rules let a member read exactly those) and the member's ledger.
 *
 * - Before a day is Billable the member's own allocation applies; the corp only
 *   gets a "Pending corp record" hint, never an amount owed.
 * - Once Billable the book decides quantity, price and rate for exactly what
 *   it observed (an issued Statement's line is that decision, frozen). The
 *   member's own ore is only used to attribute: several books in one system on
 *   one day split it by observed quantity (`splitAcrossBooks`), the book's
 *   share comes from ore the member gave no Payee first, and ore given to
 *   another Payee is a visible conflict, not owed, that resolves to the corp 14
 *   days after the day closed (`resolveBookShare`).
 * - The free ore a book left of an entry it observed is Unattributed, owed to
 *   no one; ore no book observed at all stays Unassigned.
 * - Payments credit the Miner oldest Statement first (`allocatePayments`), and
 *   a Statement's settled days are Paid for good.
 */
import { computeAssignmentValue } from '../miningTax/valuation';
import { entryKey, type OreLine } from '../miningTax/types';
import { allocatePayments, dismissalCredits, settleTolerance, type TaxPayment } from './allocation';
import { splitAcrossBooks, resolveBookShare, type BookObservation } from './attribution';
import { dayClosesAt, isDayBillable, lastBillableDate } from './billable';
import { buildDayCharges, type DayCharge, type Miner } from './charges';
import { activeDismissalFor, type Dismissal } from './dismissals';
import { observedEntryKey } from './observed';
import type { TaxRate, RateScope } from './rates';
import type { Statement, StatementLine } from './statements';
import type { DayPrices } from './valuation';
import type { ObservedMiningEntry } from './types';

export type BookRowState = 'billed' | 'sent-waiting' | 'conflict' | 'dismissed' | 'paid';
/** A relabel of a personal row that has no Payee yet, not a row of its own. */
export type BookLabelState = 'pending' | 'unattributed';

/** What the member gave a Payee of one Mining Ledger Entry. */
export interface PersonalAllocation {
  payeeId: string;
  taxPct: number;
  oreLines: OreLine[];
  status: string;
}

export interface PersonalEntry {
  characterId: number;
  date: string;
  solarSystemId: number;
  /** The whole Mining Ledger Entry. */
  oreLines: OreLine[];
  /** The part of it the member has given to no Payee. */
  freeOreLines: OreLine[];
  allocations: PersonalAllocation[];
}

export interface PersonalBook {
  corporationId: number;
  corpName: string;
  /** The tracked Characters this book is read for; Unattributed is only said of their ore. */
  characterIds?: number[];
  startDate: string;
  graceHours?: number;
  /** The book's last sync by any officer; absent when never synced. */
  lastSyncedAt?: string;
  rates: TaxRate[];
  miners: Miner[];
  observed: ObservedMiningEntry[];
  dismissals: Dismissal[];
  statements: Statement[];
  payments: TaxPayment[];
  hubId: string;
  oreForm: 'compressed' | 'raw';
  /** The day's prices at the book's hub and Ore Form, by raw type id (`priceObservedDay`). */
  pricesOn: (date: string) => Pick<DayPrices, 'prices' | 'sources'>;
  /** Donations the member has sent the corp that the book has not credited yet. */
  inFlight: { amount: number; at: string }[];
}

export interface BookDispute {
  quantity: boolean;
  rate: boolean;
  personalQuantity: number;
  bookQuantity: number;
  /** The rate the member allocated the day at, when they allocated it at one rate. */
  personalPct?: number;
  bookPct: number;
}

export interface BookRowView {
  /** Unique across books and rows. */
  id: string;
  corporationId: number;
  corpName: string;
  characterId: number;
  date: string;
  /** The personal entry's system; 0 when the book row could not be lined up with one. */
  solarSystemId: number;
  state: BookRowState;
  /** What this row is about: the quantity the corp bills (or, for a conflict, the contested ore). */
  oreLines: OreLine[];
  /** The member's own Mining Ledger Entry for the day, when one lines up — what "you" says in the diff. */
  personalOreLines?: OreLine[];
  /** Per-unit price by raw type id the book valued the day at. */
  unitPrices: Record<number, number>;
  priceSources: Record<number, string>;
  taxPct: number;
  rateScope: RateScope;
  rateEffectiveFrom?: string;
  estimatedValue: number;
  /** Still owed; `null` for a conflict (visible, not owed), 0 once paid or dismissed. */
  taxOwed: number | null;
  /** The whole bill of the day, before payments. */
  billed: number;
  statementId?: string;
  dismissalReason?: string;
  /** A conflict: when it resolves to the corp. */
  resolvesAt?: string;
  dispute?: BookDispute;
  hubId: string;
  oreForm: 'compressed' | 'raw';
}

export interface BookSummary {
  corporationId: number;
  corpName: string;
  startDate: string;
  lastSyncedAt?: string;
  /** The latest Billable day, or undefined with no sync after the grace. */
  closedThrough?: string;
  /** Payment the book holds beyond what its Statements bill — printed on the next Statement. */
  credit: number;
  hubId: string;
  oreForm: 'compressed' | 'raw';
  inFlightAmount: number;
}

export interface PersonalOverlay {
  /** Rows to add to the tab: everything the book decided. */
  rows: BookRowView[];
  /** Per Mining Ledger Entry key, the free ore the books took — the residual row shrinks by it. */
  takenFromFree: Map<string, OreLine[]>;
  /** Per Mining Ledger Entry key, how its remaining free ore reads. */
  labels: Map<string, { state: BookLabelState; corporationId: number; corpName: string }>;
  books: BookSummary[];
}

function sumLines(...lists: readonly (readonly OreLine[])[]): OreLine[] {
  const byType = new Map<number, number>();
  for (const list of lists) {
    for (const line of list)
      byType.set(line.typeId, (byType.get(line.typeId) ?? 0) + line.quantity);
  }
  return [...byType]
    .map(([typeId, quantity]) => ({ typeId, quantity }))
    .filter((l) => l.quantity > 0)
    .sort((a, b) => a.typeId - b.typeId);
}

function minusLines(from: readonly OreLine[], take: readonly OreLine[]): OreLine[] {
  const gone = new Map(take.map((l) => [l.typeId, l.quantity]));
  return from
    .map((l) => ({ typeId: l.typeId, quantity: l.quantity - (gone.get(l.typeId) ?? 0) }))
    .filter((l) => l.quantity > 0);
}

const quantityOf = (lines: readonly OreLine[]) => lines.reduce((sum, l) => sum + l.quantity, 0);

function quantityOfTypes(lines: readonly OreLine[], typeIds: ReadonlySet<number>): number {
  return lines.filter((l) => typeIds.has(l.typeId)).reduce((sum, l) => sum + l.quantity, 0);
}

function priceMap(prices: Record<number, number>): Map<number, number> {
  return new Map(Object.entries(prices).map(([typeId, price]) => [Number(typeId), price]));
}

/** The personal entry an Observed Mining Entry lines up with, or undefined. */
function matchEntry(
  observed: ObservedMiningEntry,
  entries: readonly PersonalEntry[]
): PersonalEntry | undefined {
  const day = entries.filter(
    (e) => e.characterId === observed.characterId && e.date === observed.date
  );
  if (observed.solarSystemId !== undefined) {
    return day.find((e) => e.solarSystemId === observed.solarSystemId);
  }
  if (day.length <= 1) return day[0];
  // Several systems that day and the book did not say which: the one sharing the most ore.
  const types = new Set(observed.oreLines.map((l) => l.typeId));
  const scored = day
    .map((e) => ({ e, shared: quantityOfTypes(e.oreLines, types) }))
    .sort((a, b) => b.shared - a.shared);
  return scored[0].shared > 0 ? scored[0].e : undefined;
}

interface PreparedCharge {
  charge: DayCharge;
  observed: ObservedMiningEntry;
  entry?: PersonalEntry;
  dismissal?: Dismissal;
  statement?: { id: string; lines: StatementLine[] };
  /** Whether the day is Billable (always true once on a Statement). */
  billable: boolean;
  /** Ore the corp observed. */
  oreLines: OreLine[];
}

interface Prepared {
  book: PersonalBook;
  charges: PreparedCharge[];
  /** Observations nothing can bill yet: unrated or not Billable, lined up with an entry or not. */
  pending: { observed: ObservedMiningEntry; entry?: PersonalEntry }[];
  /** Per Statement id: settled, and what has been credited towards its non-dismissed days. */
  settlement: Map<string, { settled: boolean; pool: number }>;
  credit: number;
}

function prepare(book: PersonalBook, entries: readonly PersonalEntry[], now: string): Prepared {
  const { charges, unrated } = buildDayCharges(book.observed, {
    corporationId: book.corporationId,
    startDate: book.startDate,
    miners: book.miners,
    rates: book.rates,
    pricesOn: book.pricesOn,
    placeOf: (structureId, date) => {
      const moonId = book.observed.find(
        (o) => o.structureId === structureId && o.date === date && o.moonId !== undefined
      )?.moonId;
      return moonId === undefined ? {} : { moonId };
    },
  });
  const observedByKey = new Map(book.observed.map((o) => [observedEntryKey(o), o]));
  const lineIndex = new Map<string, { id: string; lines: StatementLine[] }>();
  for (const statement of book.statements) {
    for (const line of statement.lines) {
      if (!line.chargeKey) continue;
      const held = lineIndex.get(line.chargeKey) ?? { id: statement.id, lines: [] };
      held.lines.push(line);
      lineIndex.set(line.chargeKey, held);
    }
  }
  const clock = {
    now,
    ...(book.lastSyncedAt !== undefined ? { lastSyncedAt: book.lastSyncedAt } : {}),
    ...(book.graceHours !== undefined ? { graceHours: book.graceHours } : {}),
  };
  const prepared: PreparedCharge[] = [];
  const pending: Prepared['pending'] = [];
  for (const charge of charges) {
    const observed = observedByKey.get(charge.key)!;
    const statement = lineIndex.get(charge.key);
    const dismissal = activeDismissalFor(charge, book.dismissals);
    const billable = statement !== undefined || isDayBillable(charge.date, clock);
    const entry = matchEntry(observed, entries);
    if (!billable) {
      pending.push({ observed, ...(entry ? { entry } : {}) });
      continue;
    }
    prepared.push({
      charge,
      observed,
      ...(entry ? { entry } : {}),
      ...(dismissal ? { dismissal } : {}),
      ...(statement ? { statement } : {}),
      billable,
      oreLines: charge.oreLines,
    });
  }
  for (const observed of unrated) {
    const entry = matchEntry(observed, entries);
    pending.push({ observed, ...(entry ? { entry } : {}) });
  }

  // Payments credit each Miner's Statements, oldest first (D5/D15).
  const settlement: Prepared['settlement'] = new Map();
  let credit = 0;
  const minerIds = new Set(book.statements.map((s) => s.minerId));
  for (const minerId of minerIds) {
    const statements = book.statements.filter((s) => s.minerId === minerId);
    const credits = dismissalCredits(statements, book.dismissals, charges);
    const allocation = allocatePayments({
      statements,
      payments: book.payments.filter((p) => p.minerId === minerId),
      dismissalCredits: credits,
      startDate: book.startDate,
    });
    credit += allocation.credit;
    for (const s of statements) {
      const result = allocation.byStatement.get(s.id);
      const dismissed = credits
        .filter((c) => c.statementId === s.id)
        .reduce((sum, c) => sum + c.amount, 0);
      settlement.set(s.id, {
        settled: result?.settled ?? false,
        pool: Math.max(0, (result?.credited ?? 0) - dismissed),
      });
    }
  }
  return { book, charges: prepared, pending, settlement, credit };
}

function dayValue(p: PreparedCharge): {
  lines: OreLine[];
  unitPrices: Record<number, number>;
  priceSources: Record<number, string>;
  taxPct: number;
  rateEffectiveFrom?: string;
  estimatedValue: number;
  tax: number;
} {
  const { charge, statement } = p;
  if (!statement) {
    const { estimatedValue, taxOwed } = computeAssignmentValue(
      charge.oreLines,
      priceMap(charge.unitPrices),
      charge.taxPct
    );
    return {
      lines: charge.oreLines,
      unitPrices: charge.unitPrices,
      priceSources: charge.priceSources,
      taxPct: charge.taxPct,
      ...(charge.rateEffectiveFrom !== undefined
        ? { rateEffectiveFrom: charge.rateEffectiveFrom }
        : {}),
      estimatedValue,
      tax: taxOwed,
    };
  }
  // What the Statement billed, frozen: every line of this day (late ore adds lines).
  const lines = sumLines(...statement.lines.map((l) => l.oreLines));
  const first = statement.lines[0];
  const estimatedValue = statement.lines.reduce((sum, l) => sum + l.estimatedValue, 0);
  const tax = statement.lines.reduce((sum, l) => sum + l.tax, 0);
  // Each line was billed at its own rate (a rate fix lands on later lines only), so
  // the day shows one rate only when its lines share it, else the rate they came to.
  const pcts = new Set(statement.lines.map((l) => l.taxPct ?? charge.taxPct));
  const mixed = pcts.size > 1;
  const taxPct = mixed
    ? estimatedValue > 0
      ? Math.round((tax / estimatedValue) * 100 * 1e4) / 1e4
      : charge.taxPct
    : (first.taxPct ?? charge.taxPct);
  const rateEffectiveFrom = mixed
    ? undefined
    : (first.rateEffectiveFrom ?? charge.rateEffectiveFrom);
  return {
    lines,
    unitPrices: first.unitPrices ?? charge.unitPrices,
    priceSources: (first.priceSources as Record<number, string> | undefined) ?? charge.priceSources,
    taxPct,
    ...(rateEffectiveFrom !== undefined ? { rateEffectiveFrom } : {}),
    estimatedValue,
    tax,
  };
}

function disputeOf(
  entry: PersonalEntry | undefined,
  bookLines: readonly OreLine[],
  bookPct: number
): BookDispute | undefined {
  if (!entry) return undefined;
  const types = new Set(bookLines.map((l) => l.typeId));
  const personalQuantity = quantityOfTypes(entry.oreLines, types);
  const bookQuantity = quantityOf(bookLines);
  const pcts = new Set(entry.allocations.map((a) => a.taxPct));
  const personalPct = pcts.size === 1 ? [...pcts][0] : undefined;
  const quantity = personalQuantity !== bookQuantity;
  const rate = personalPct !== undefined && personalPct !== bookPct;
  if (!quantity && !rate) return undefined;
  return {
    quantity,
    rate,
    personalQuantity,
    bookQuantity,
    ...(personalPct !== undefined ? { personalPct } : {}),
    bookPct,
  };
}

const addTaken = (map: Map<string, OreLine[]>, key: string, lines: readonly OreLine[]) => {
  if (lines.length > 0) map.set(key, sumLines(map.get(key) ?? [], lines));
};

export function overlayCorpBooks(input: {
  entries: readonly PersonalEntry[];
  books: readonly PersonalBook[];
  now: string;
}): PersonalOverlay {
  const { entries, now } = input;
  const books = [...input.books].sort((a, b) => a.corporationId - b.corporationId);
  const prepared = books.map((book) => prepare(book, entries, now));
  const rows: BookRowView[] = [];
  const takenFromFree = new Map<string, OreLine[]>();
  const labels: PersonalOverlay['labels'] = new Map();

  // The ore each personal entry still has free after the books, per entry key.
  const free = new Map(
    entries.map((e) => [entryKey(e.characterId, e.date, e.solarSystemId), e.freeOreLines])
  );
  const entryByKey = new Map(
    entries.map((e) => [entryKey(e.characterId, e.date, e.solarSystemId), e])
  );

  // Charges grouped per personal entry (and the ones no entry matches), per book.
  const chargesOf = (p: Prepared, key: string) =>
    p.charges.filter(
      (c) =>
        c.entry !== undefined &&
        entryKey(c.entry.characterId, c.entry.date, c.entry.solarSystemId) === key
    );

  const rowsByBook = new Map<number, BookRowView[]>();
  const pushRow = (row: BookRowView) => {
    rows.push(row);
    const list = rowsByBook.get(row.corporationId) ?? [];
    list.push(row);
    rowsByBook.set(row.corporationId, list);
  };

  const buildRows = (
    p: Prepared,
    charge: PreparedCharge,
    lines: readonly OreLine[],
    conflict: { lines: OreLine[]; resolvesAt: string } | undefined,
    soleBook = true
  ) => {
    const { book } = p;
    const value = dayValue(charge);
    const owedLines = conflict ? minusLines(value.lines, conflict.lines) : value.lines;
    const solarSystemId = charge.entry?.solarSystemId ?? charge.observed.solarSystemId ?? 0;
    const common = {
      corporationId: book.corporationId,
      corpName: book.corpName,
      characterId: charge.charge.characterId,
      date: charge.charge.date,
      solarSystemId,
      unitPrices: value.unitPrices,
      priceSources: value.priceSources,
      taxPct: value.taxPct,
      rateScope: charge.charge.rateScope,
      ...(value.rateEffectiveFrom !== undefined
        ? { rateEffectiveFrom: value.rateEffectiveFrom }
        : {}),
      ...(charge.entry ? { personalOreLines: charge.entry.oreLines } : {}),
      hubId: book.hubId,
      oreForm: book.oreForm,
    };
    // With several books the member's entry is split among them: one book's share is not a dispute.
    const dispute = soleBook ? disputeOf(charge.entry, lines, value.taxPct) : undefined;
    if (conflict) {
      const worth = computeAssignmentValue(
        conflict.lines,
        priceMap(value.unitPrices),
        value.taxPct
      );
      pushRow({
        ...common,
        id: `${book.corporationId}:${charge.charge.key}:conflict`,
        state: 'conflict',
        oreLines: conflict.lines,
        estimatedValue: worth.estimatedValue,
        taxOwed: null,
        billed: worth.taxOwed,
        resolvesAt: conflict.resolvesAt,
        ...(dispute ? { dispute } : {}),
      });
      if (owedLines.length === 0) return;
    }
    const worth = conflict
      ? computeAssignmentValue(owedLines, priceMap(value.unitPrices), value.taxPct)
      : { estimatedValue: value.estimatedValue, taxOwed: value.tax };
    const id = `${book.corporationId}:${charge.charge.key}`;
    if (charge.dismissal) {
      pushRow({
        ...common,
        id,
        state: 'dismissed',
        oreLines: owedLines,
        estimatedValue: worth.estimatedValue,
        taxOwed: 0,
        billed: worth.taxOwed,
        dismissalReason: charge.dismissal.reason,
        ...(charge.statement ? { statementId: charge.statement.id } : {}),
      });
      return;
    }
    pushRow({
      ...common,
      id,
      state: 'billed',
      oreLines: owedLines,
      estimatedValue: worth.estimatedValue,
      taxOwed: worth.taxOwed,
      billed: worth.taxOwed,
      ...(charge.statement ? { statementId: charge.statement.id } : {}),
      ...(dispute && !conflict ? { dispute } : {}),
    });
  };

  // 1. Entries with a personal counterpart: attribute across the books that are Billable.
  for (const [key, entry] of entryByKey) {
    const claiming = prepared.filter((p) => chargesOf(p, key).length > 0);
    if (claiming.length === 0) continue;
    const observations: BookObservation[] = claiming.map((p) => ({
      bookId: String(p.book.corporationId),
      oreLines: sumLines(...chargesOf(p, key).map((c) => c.oreLines)),
    }));
    const split = splitAcrossBooks(entry.oreLines, observations);
    let left = free.get(key) ?? [];
    for (const p of claiming) {
      const share = split.byBook.get(String(p.book.corporationId)) ?? [];
      const here = chargesOf(p, key);
      const onStatement = here.every((c) => c.statement !== undefined);
      const resolved = resolveBookShare({
        share,
        free: left,
        conflictSince: dayClosesAt(entry.date, p.book.graceHours),
        now,
      });
      left = resolved.freeLeft;
      addTaken(takenFromFree, key, resolved.fromFree);
      // A day on a Statement is the corp's decision, owed in full; so is a conflict that ran its 14 days.
      const contested =
        onStatement || resolved.conflict.length === 0 || resolved.conflictOwed
          ? undefined
          : { lines: resolved.conflict, resolvesAt: resolved.conflictResolvesAt ?? '' };
      let remaining = contested?.lines ?? [];
      for (const charge of here) {
        // Hand the contested ore to the first charges that observed it.
        const mine = sumLines(...[charge.oreLines]);
        const take = remaining
          .map((l) => ({
            typeId: l.typeId,
            quantity: Math.min(l.quantity, mine.find((m) => m.typeId === l.typeId)?.quantity ?? 0),
          }))
          .filter((l) => l.quantity > 0);
        remaining = minusLines(remaining, take);
        buildRows(
          p,
          charge,
          charge.oreLines,
          contested && take.length > 0
            ? { lines: take, resolvesAt: contested.resolvesAt }
            : undefined,
          claiming.length === 1
        );
      }
    }
    free.set(key, left);
  }

  // 2. What no personal entry lines up with: the book alone decides.
  for (const p of prepared) {
    for (const charge of p.charges) {
      if (charge.entry) continue;
      buildRows(p, charge, charge.oreLines, undefined);
    }
  }

  // 3. Payments: a Statement's days are Paid oldest first; part payments land on the oldest days.
  for (const p of prepared) {
    const mine = rowsByBook.get(p.book.corporationId) ?? [];
    const byStatement = new Map<string, BookRowView[]>();
    for (const row of mine) {
      if (!row.statementId || row.state !== 'billed') continue;
      byStatement.set(row.statementId, [...(byStatement.get(row.statementId) ?? []), row]);
    }
    for (const [statementId, list] of byStatement) {
      const state = p.settlement.get(statementId);
      if (!state) continue;
      let pool = state.pool;
      for (const row of list.sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
      )) {
        const owed = row.taxOwed ?? 0;
        if (state.settled || pool >= owed) {
          row.state = 'paid';
          row.taxOwed = 0;
          pool = Math.max(0, pool - owed);
        } else if (pool > 0) {
          row.taxOwed = owed - pool;
          pool = 0;
        }
      }
    }
    // Donations sent and not yet credited cover the oldest Billed days.
    const inFlightTotal = p.book.inFlight.reduce((sum, d) => sum + d.amount, 0);
    const open = mine.filter((r) => r.state === 'billed' && (r.taxOwed ?? 0) > 0);
    for (const id of coverInFlight(
      open.map((r) => ({ id: r.id, date: r.date, taxOwed: r.taxOwed ?? 0 })),
      inFlightTotal
    )) {
      const row = open.find((r) => r.id === id);
      if (row) row.state = 'sent-waiting';
    }
  }

  // 4. How the free ore the books left reads: pending, or unattributed.
  for (const [key, entry] of entryByKey) {
    if (quantityOf(free.get(key) ?? []) === 0) continue;
    const pendingBook = prepared.find((p) =>
      p.pending.some(
        (x) =>
          x.entry !== undefined &&
          entryKey(x.entry.characterId, x.entry.date, x.entry.solarSystemId) === key
      )
    );
    if (pendingBook) {
      labels.set(key, {
        state: 'pending',
        corporationId: pendingBook.book.corporationId,
        corpName: pendingBook.book.corpName,
      });
      continue;
    }
    // Unattributed is the unclaimed remainder of an entry some book observed (D12);
    // ore no book observed at all stays plain Unassigned.
    const closed = prepared.find(
      (p) =>
        chargesOf(p, key).length > 0 &&
        (p.book.characterIds === undefined || p.book.characterIds.includes(entry.characterId)) &&
        entry.date >= p.book.startDate &&
        isDayBillable(entry.date, {
          now,
          ...(p.book.lastSyncedAt !== undefined ? { lastSyncedAt: p.book.lastSyncedAt } : {}),
          ...(p.book.graceHours !== undefined ? { graceHours: p.book.graceHours } : {}),
        })
    );
    if (closed) {
      labels.set(key, {
        state: 'unattributed',
        corporationId: closed.book.corporationId,
        corpName: closed.book.corpName,
      });
    }
  }

  const summaries: BookSummary[] = prepared.map((p) => {
    const closedThrough = lastBillableDate({
      now,
      ...(p.book.lastSyncedAt !== undefined ? { lastSyncedAt: p.book.lastSyncedAt } : {}),
      ...(p.book.graceHours !== undefined ? { graceHours: p.book.graceHours } : {}),
    });
    return {
      corporationId: p.book.corporationId,
      corpName: p.book.corpName,
      startDate: p.book.startDate,
      ...(p.book.lastSyncedAt !== undefined ? { lastSyncedAt: p.book.lastSyncedAt } : {}),
      ...(closedThrough !== undefined ? { closedThrough } : {}),
      credit: p.credit,
      hubId: p.book.hubId,
      oreForm: p.book.oreForm,
      inFlightAmount: p.book.inFlight.reduce((sum, d) => sum + d.amount, 0),
    };
  });

  rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return { rows, takenFromFree, labels, books: summaries };
}

// --- Payments in flight ------------------------------------------------------

/** A donation as the member's own wallet journal shows it (`MadePayment`). */
export interface MadeDonation {
  characterId: number;
  counterpartyId?: number;
  amount: number | null;
  date: string;
  method: string;
}

/** A Tax Payment the book already holds. */
export interface HeldPayment {
  characterId: number;
  amount: number;
  at: string;
  notTaxAmount?: number;
}

/** The corp's journal stamps the same ISK transfer within the same minute or two. */
const SAME_TRANSFER_MS = 10 * 60_000;

/**
 * Donations the member sent to the corp (their own journal) that the book does
 * not hold yet — "Sent, waiting for the corp". The corp's journal ids differ
 * from the member's, so a held payment is recognised by sender, amount and time.
 */
export function inFlightDonations(
  made: readonly MadeDonation[],
  held: readonly HeldPayment[],
  corporationId: number,
  startDate: string
): { amount: number; at: string }[] {
  return made
    .filter(
      (m) =>
        m.method === 'donation' &&
        m.counterpartyId === corporationId &&
        m.amount !== null &&
        m.amount > 0 &&
        m.date.slice(0, 10) >= startDate
    )
    .filter(
      (m) =>
        !held.some(
          (h) =>
            h.characterId === m.characterId &&
            Math.abs(h.amount - (m.amount ?? 0)) < 1 &&
            Math.abs(Date.parse(h.at) - Date.parse(m.date)) <= SAME_TRANSFER_MS
        )
    )
    .map((m) => ({ amount: m.amount as number, at: m.date }));
}

/** Which rows an in-flight sum covers: whole days, oldest first, within the settle tolerance. */
export function coverInFlight(
  rows: readonly { id: string; date: string; taxOwed: number }[],
  total: number
): Set<string> {
  const covered = new Set<string>();
  let left = total;
  for (const row of [...rows].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  )) {
    // A day smaller than the tolerance is still not covered by nothing.
    if (left <= 0 || left < row.taxOwed - settleTolerance(row.taxOwed)) break;
    covered.add(row.id);
    left = Math.max(0, left - row.taxOwed);
  }
  return covered;
}
