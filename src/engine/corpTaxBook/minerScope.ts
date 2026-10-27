/**
 * What the Miner page reads from the read models instead of the whole ledger (#5258,
 * ADR 0032). Pure: no fetch, DOM or Dexie.
 *
 * A Miner's ledger rows split in two. Days on an issued Statement are frozen (D22): their
 * lines hold the quantities, prices, rate and tax, so those days are rebuilt from the
 * lines and need no ledger row and no price. Only the days since the newest Statement began
 * (the open set) are read as ledger rows. Both go through `buildBookView` like any book, so
 * every figure on the page comes from the engine the whole-book path uses.
 *
 * Known gap: ore recorded after a Statement older than the window was paid (a late
 * write-off) and a dismissed or unrated day older than the window are not listed, because
 * their ledger rows are not read.
 */
import type { Statement, StatementLine } from './statements';
import type { BookView } from './bookView';
import type { ObservedRow } from './types';
import { observedEntryKey } from './observed';

/** First day whose ledger rows the page reads: the newest Statement's first day, else the book's start. */
export function openWindowStart(statements: readonly Statement[], startDate: string): string {
  let from = startDate;
  for (const s of statements) if (s.coversFrom > from) from = s.coversFrom;
  return from;
}

interface FrozenOptions {
  /** The corporation a character's rows were recorded under (a guest's rate differs). */
  corpFor: (characterId: number) => number;
  /** Day charge keys the ledger window already supplies. */
  skip: ReadonlySet<string>;
}

/**
 * Ledger rows rebuilt from Statement lines: per day (character, refinery, date) and ore,
 * the quantities every line billed, late-ore growth included.
 */
export function frozenRows(
  statements: readonly Statement[],
  { corpFor, skip }: FrozenOptions
): ObservedRow[] {
  const days = new Map<
    string,
    {
      line: StatementLine;
      characterId: number;
      structureId: number;
      at: string;
      ore: Map<number, number>;
    }
  >();
  for (const s of statements)
    for (const line of s.lines) {
      const { chargeKey, characterId, structureId } = line;
      if (!chargeKey || characterId === undefined || structureId === undefined) continue;
      if (skip.has(chargeKey)) continue;
      const day = days.get(chargeKey) ?? {
        line,
        characterId,
        structureId,
        at: s.issuedAt,
        ore: new Map<number, number>(),
      };
      for (const o of line.oreLines)
        day.ore.set(o.typeId, (day.ore.get(o.typeId) ?? 0) + o.quantity);
      days.set(chargeKey, day);
    }
  const rows: ObservedRow[] = [];
  for (const day of days.values())
    for (const [typeId, quantity] of day.ore)
      rows.push({
        structureId: day.structureId,
        characterId: day.characterId,
        recordedCorporationId: corpFor(day.characterId),
        typeId,
        date: day.line.date,
        quantity,
        cachedAt: day.at,
      });
  return rows;
}

/** The window's ledger rows plus the frozen days they do not cover. */
export function minerScopedRows(
  statements: readonly Statement[],
  windowRows: readonly ObservedRow[],
  opts: Pick<FrozenOptions, 'corpFor'>
): ObservedRow[] {
  const skip = new Set(windowRows.map(observedEntryKey));
  return [...windowRows, ...frozenRows(statements, { ...opts, skip })];
}

/** The slice of a `minerTotals` doc the page header takes. */
export interface HeaderTotals {
  schema: number;
  owed: number;
  credit: number;
  lastPaidAt: string | null;
}

/** The totals doc's schema this client understands (`MINER_TOTALS_SCHEMA`, functions). */
export const MINER_TOTALS_SCHEMA_READ = 1;

/**
 * The page header's owed, credit and last payment from the Miner's stored totals. No doc,
 * or one of another schema, leaves the computed figures (the doc may not be deployed yet).
 */
export function withMinerTotals(
  view: BookView,
  minerId: string,
  totals: HeaderTotals | undefined
): BookView {
  if (!totals || totals.schema !== MINER_TOTALS_SCHEMA_READ) return view;
  return {
    ...view,
    miners: view.miners.map((m) =>
      m.id === minerId
        ? { ...m, owed: totals.owed, credit: totals.credit, lastPaidAt: totals.lastPaidAt }
        : m
    ),
  };
}
