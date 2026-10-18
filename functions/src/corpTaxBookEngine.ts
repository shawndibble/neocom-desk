// The slice of the Corp Tax Book engine (src/engine/corpTaxBook, issue #4059)
// that the callables enforce. `functions/` is a separate NodeNext package that
// cannot import `src/`, so — as marketSnapshot.ts does for the trade hubs —
// this is a small mirror kept honest by a parity test in the root suite
// (src/engine/corpTaxBook/functionsMirror.test.ts), which runs both copies on
// the same inputs. Change the engine first, then this file. Dependency-free on
// purpose so that test can import it from the root package.

export interface ObservedRow {
  structureId: number;
  characterId: number;
  recordedCorporationId: number;
  typeId: number;
  date: string;
  quantity: number;
  cachedAt: string;
  /** Where the refinery is and which moon it drilled, when the syncing officer's client knew (#4065). */
  solarSystemId?: number;
  moonId?: number;
}

/** The upsert key: miner + ore + day + structure (engine `observedRowKey`). */
export function observedRowKey(row: ObservedRow): string {
  return `${row.characterId}:${row.typeId}:${row.date}:${row.structureId}`;
}

export interface ObservedMerge {
  rows: ObservedRow[];
  changed: ObservedRow[];
}

/** Engine `mergeObservedRows`: quantity never goes down; an older ESI cache is ignored. */
export function mergeObservedRows(
  existing: readonly ObservedRow[],
  fresh: readonly ObservedRow[]
): ObservedMerge {
  const byKey = new Map(existing.map((row) => [observedRowKey(row), row]));
  const changed: ObservedRow[] = [];
  for (const row of fresh) {
    const key = observedRowKey(row);
    const held = byKey.get(key);
    if (held) {
      if (Date.parse(row.cachedAt) < Date.parse(held.cachedAt)) continue;
      if (row.quantity <= held.quantity) continue;
    }
    byKey.set(key, row);
    changed.push(row);
  }
  return { rows: [...byKey.values()], changed };
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Engine `isRetroactiveRate`. The start-date rate at book creation skips it. */
export function isRetroactiveRate(effectiveFrom: string, today: string): boolean {
  return effectiveFrom < today;
}

/** The fields of a stored Statement the date rules read. */
export interface StatementDays {
  id: string;
  coversFrom: string;
  coversThrough: string;
  lines: { kind: string; date: string }[];
}

/** Engine `statementDays`. */
export function statementDays(statement: StatementDays): Set<string> {
  const days = new Set<string>();
  for (let d = statement.coversFrom; d <= statement.coversThrough; d = shiftDate(d, 1)) days.add(d);
  for (const line of statement.lines) if (line.kind !== 'correction') days.add(line.date);
  return days;
}

/** Engine `canOverrideRecordRate` over `daysOnStatements`. */
export function canOverrideRecordRate(date: string, statements: readonly StatementDays[]): boolean {
  return !statements.some((s) => statementDays(s).has(date));
}

/** Engine `canRebillFrom` (D22): never reaches a day a paid Statement covered. */
export function canRebillFrom(
  date: string,
  statements: readonly StatementDays[],
  paidStatementIds: ReadonlySet<string>
): boolean {
  return statements.every((s) => !paidStatementIds.has(s.id) || date > s.coversThrough);
}

// Book defaults (hand-off from #4059: they live in the backend, not the engine).
// Grace, minimum Statement and Overdue days equal the engine's
// DEFAULT_GRACE_HOURS, DEFAULT_MINIMUM_STATEMENT and DEFAULT_OVERDUE_DAYS.
export const BOOK_DEFAULTS = {
  hubId: 'jita',
  oreForm: 'compressed',
  graceHours: 6,
  minimumStatement: 5_000_000,
  overdueDays: 14,
  divisions: [1],
  cadence: { kind: 'monthly' },
} as const;
