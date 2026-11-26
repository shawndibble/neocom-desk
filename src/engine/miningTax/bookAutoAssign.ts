import { isDayBillable } from '../corpTaxBook/billable';
import { minerIdFor, type Miner } from '../corpTaxBook/charges';
import { observedEntryKey } from '../corpTaxBook/observed';
import { resolveRate, type RateScope, type TaxRate } from '../corpTaxBook/rates';
import type { ObservedMiningEntry } from '../corpTaxBook/types';
import { defaultOptOutKey, isUnpaidDefault } from './defaultSystems';
import { payeesOfBookCorporation, type PayeeLike } from './payeeCorporation';
import type { Takeover } from './surveyConnection';
import type { MiningLedgerEntry, OreLine } from './types';

export interface AutoAssignBook {
  corporationId: number;
  corpName: string;
  characterIds: readonly number[];
  memberCharacterIds?: readonly number[];
  startDate: string;
  graceHours?: number;
  lastSyncedAt?: string;
  rates: readonly TaxRate[];
  miners: readonly Miner[];
  observed: readonly ObservedMiningEntry[];
  structureNames?: Readonly<Record<number, string>>;
}

export interface AutoAssignCovering {
  id: string;
  characterId: number;
  date: string;
  solarSystemId: number;
  payeeId?: string;
  oreLines: readonly OreLine[];
  status?: string;
  override?: boolean;
}

export interface BookAutoAssignInput {
  entries: readonly MiningLedgerEntry[];
  assignments: readonly AutoAssignCovering[];
  books: readonly AutoAssignBook[];
  payees: readonly PayeeLike[];
  optedOut: ReadonlySet<string>;
  now: string;
}

export interface BookAutoAssignSlice {
  corporationId: number;
  characterId: number;
  date: string;
  solarSystemId: number;
  minerId: string;
  payeeId?: string;
  taxPct: number;
  rateScope: RateScope;
  label?: string;
  oreLines: OreLine[];
  entryOreLines: readonly OreLine[];
  takeovers: Takeover[];
}

function coversEntry(book: AutoAssignBook, e: MiningLedgerEntry, now: string): boolean {
  return (
    book.characterIds.includes(e.characterId) &&
    e.date >= book.startDate &&
    book.observed.some((o) => o.solarSystemId === e.solarSystemId) &&
    !isDayBillable(e.date, {
      now,
      ...(book.lastSyncedAt !== undefined ? { lastSyncedAt: book.lastSyncedAt } : {}),
      ...(book.graceHours !== undefined ? { graceHours: book.graceHours } : {}),
    })
  );
}

function placeSeen(book: AutoAssignBook, e: MiningLedgerEntry) {
  const inSystem = book.observed.filter((o) => o.solarSystemId === e.solarSystemId);
  const mine = inSystem.filter((o) => o.characterId === e.characterId);
  const today = mine
    .filter((o) => o.date === e.date)
    .sort((a, b) => a.structureId - b.structureId)[0];
  const before = mine
    .filter((o) => o.date < e.date)
    .sort((a, b) => b.date.localeCompare(a.date) || a.structureId - b.structureId)[0];
  const seen = today ?? before;
  const structures = [...new Set(inSystem.map((o) => o.structureId))];
  const structureId = seen?.structureId ?? (structures.length === 1 ? structures[0] : undefined);
  const moonId =
    seen?.moonId ??
    inSystem
      .filter((o) => o.structureId === structureId && o.moonId !== undefined)
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.moonId;
  return { today, seen, structureId, moonId };
}

function rateOf(book: AutoAssignBook, e: MiningLedgerEntry, minerId: string) {
  const { today, seen, structureId, moonId } = placeSeen(book, e);
  const isGuest = seen
    ? seen.recordedCorporationId !== book.corporationId
    : book.memberCharacterIds !== undefined && !book.memberCharacterIds.includes(e.characterId);
  const rate = resolveRate(book.rates, {
    date: e.date,
    minerId,
    moonId,
    ...(structureId !== undefined ? { structureId } : {}),
    recordKey: today ? observedEntryKey(today) : '',
    ...(seen?.sourceCorporationId !== undefined ? { feederId: seen.sourceCorporationId } : {}),
    isGuest,
    ...(seen ? { minerCorporationId: seen.recordedCorporationId } : {}),
  });
  return { rate, structureId };
}

export function planBookAutoAssign(input: BookAutoAssignInput): BookAutoAssignSlice[] {
  const byEntry = new Map<string, AutoAssignCovering[]>();
  for (const a of input.assignments) {
    const key = defaultOptOutKey(a.characterId, a.date, a.solarSystemId);
    byEntry.set(key, [...(byEntry.get(key) ?? []), a]);
  }
  const slices: BookAutoAssignSlice[] = [];
  for (const e of input.entries) {
    const key = defaultOptOutKey(e.characterId, e.date, e.solarSystemId);
    if (input.optedOut.has(key)) continue;
    if (!e.oreLines.some((l) => l.quantity > 0)) continue;
    const books = input.books.filter((b) => coversEntry(b, e, input.now));
    if (books.length !== 1) continue;
    const book = books[0]!;
    const own = payeesOfBookCorporation(
      input.payees.filter((p) => p.characterId === e.characterId),
      { corporationId: book.corporationId, name: book.corpName }
    );
    const ownIds = new Set(own.map((p) => p.id));
    const covering = byEntry.get(key) ?? [];
    const takeable = (a: AutoAssignCovering) =>
      isUnpaidDefault(a) && !(a.payeeId !== undefined && ownIds.has(a.payeeId));
    if (!covering.every(takeable)) continue;
    const minerId = minerIdFor(e.characterId, book.miners, e.date);
    const { rate, structureId } = rateOf(book, e, minerId);
    if (!rate) continue;
    const label = structureId === undefined ? undefined : book.structureNames?.[structureId];
    slices.push({
      corporationId: book.corporationId,
      characterId: e.characterId,
      date: e.date,
      solarSystemId: e.solarSystemId,
      minerId,
      ...(own[0] ? { payeeId: own[0].id } : {}),
      taxPct: rate.pct,
      rateScope: rate.scope,
      ...(label ? { label } : {}),
      oreLines: e.oreLines.filter((l) => l.quantity > 0).map((l) => ({ ...l })),
      entryOreLines: e.oreLines,
      takeovers: covering.map((a) => ({
        assignmentId: a.id,
        typeIds: [...new Set(a.oreLines.map((l) => l.typeId))].sort((x, y) => x - y),
      })),
    });
  }
  return slices;
}
