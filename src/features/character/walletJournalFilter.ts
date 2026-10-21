import type { WalletJournalEntry } from '@/esi/endpoints';
import { defineUrlFilter, nullableTextParam, textParam } from '@/lib/urlState';
import { journalRefKey, type JournalRow } from '@/engine/journalNetting';
import { bountyKillsOf } from './bountyKills';
import { dailyGoalMessageIdOf } from './dailyGoal';

/**
 * The journal filter bar's state (issue #413): a raw ESI `ref_type`, an
 * inclusive `YYYY-MM-DD` date range, and free text. `null` (or an empty
 * string for `text`) means that criterion is inactive — every field inactive
 * is the identity filter.
 */
export interface WalletJournalFilter {
  refType: string | null;
  startDate: string | null;
  endDate: string | null;
  /** A corp journal's player, as a character id; the personal journal never sets it. */
  player: string | null;
  text: string;
}

export const EMPTY_WALLET_JOURNAL_FILTER: WalletJournalFilter = {
  refType: null,
  startDate: null,
  endDate: null,
  player: null,
  text: '',
};

/**
 * The journal filter bar's three fields in the URL (issue #413, #1302),
 * scoped `journal.` so they cannot collide with the corp Transactions
 * filter's own keys — both panels' `useUrlFilter` calls run unconditionally,
 * whichever tab is on screen.
 */
export const {
  schema: JOURNAL_FILTER_PARAMS,
  fieldToParam: JOURNAL_FIELD_TO_PARAM,
  emptyParams: EMPTY_JOURNAL_FILTER_PARAMS,
} = defineUrlFilter<WalletJournalFilter>({
  refType: { key: 'journal.refType', codec: nullableTextParam() },
  startDate: { key: 'journal.start', codec: nullableTextParam() },
  endDate: { key: 'journal.end', codec: nullableTextParam() },
  player: { key: 'journal.player', codec: nullableTextParam() },
  text: { key: 'journal.q', codec: textParam() },
});

/**
 * Every active criterion is ANDed. String comparison on the `YYYY-MM-DD`
 * slice of `entry.date` is sufficient for the range check — ISO dates sort
 * lexicographically the same as chronologically.
 */
export function filterWalletJournal<T extends WalletJournalEntry & Pick<JournalRow, 'playerId'>>(
  entries: readonly T[],
  filter: WalletJournalFilter,
  /** The description the journal shows for a line, which free text matches against. */
  describe: (entry: WalletJournalEntry) => string = (entry) => entry.description
): T[] {
  const text = filter.text.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.refType !== null && journalRefKey(entry) !== filter.refType) return false;
    if (filter.player !== null && entry.playerId?.toString() !== filter.player) return false;
    const day = entry.date.slice(0, 10);
    if (filter.startDate !== null && day < filter.startDate) return false;
    if (filter.endDate !== null && day > filter.endDate) return false;
    if (
      text !== '' &&
      !describe(entry).toLowerCase().includes(text) &&
      // A bounty line's reason is a raw kill list the journal shows as factions,
      // and a daily goal line's is a message id it shows as the goal's name.
      !(bountyKillsOf(entry) || dailyGoalMessageIdOf(entry) !== null ? '' : (entry.reason ?? ''))
        .toLowerCase()
        .includes(text)
    )
      return false;
    return true;
  });
}

export interface RefTypeBreakdownRow {
  refType: string;
  /** Sum of the positive amounts. */
  income: number;
  /** Sum of the negative amounts, as a positive magnitude. */
  expense: number;
  net: number;
  count: number;
}

export interface JournalBreakdown {
  totalIn: number;
  /** A positive magnitude. */
  totalOut: number;
  net: number;
  /** One row per ref type, largest absolute net first. */
  rows: RefTypeBreakdownRow[];
  /** Lines between the pilot's own Characters, left out of everything above. */
  internalCount: number;
}

/** The net of lines that move ISK: own-Character transfers are out, a missing amount is zero. */
export function journalNet(entries: readonly JournalRow[]): number {
  return entries.reduce((sum, entry) => (entry.internal ? sum : sum + (entry.amount ?? 0)), 0);
}

/** Where the ISK came from and went: income, expense and net per `ref_type` (issue #2858). A missing `amount` counts as zero. */
export function journalRefTypeBreakdown(entries: readonly JournalRow[]): JournalBreakdown {
  const byType = new Map<string, RefTypeBreakdownRow>();
  let internalCount = 0;
  for (const entry of entries) {
    if (entry.internal) {
      internalCount += 1;
      continue;
    }
    const amount = entry.amount ?? 0;
    const key = journalRefKey(entry);
    const row = byType.get(key) ?? {
      refType: key,
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
    };
    if (amount > 0) row.income += amount;
    else row.expense -= amount;
    row.net += amount;
    row.count += 1;
    byType.set(key, row);
  }
  const rows = [...byType.values()].sort(
    (a, b) => Math.abs(b.net) - Math.abs(a.net) || a.refType.localeCompare(b.refType)
  );
  const totalIn = rows.reduce((sum, row) => sum + row.income, 0);
  const totalOut = rows.reduce((sum, row) => sum + row.expense, 0);
  return { totalIn, totalOut, net: journalNet(entries), rows, internalCount };
}

/** A breakdown row click: select that ref type, or clear it when it is already the one selected. */
export function toggleBreakdownRefType(
  filter: WalletJournalFilter,
  refType: string
): WalletJournalFilter {
  return { ...filter, refType: filter.refType === refType ? null : refType };
}

/**
 * The distinct raw `ref_type` values present in a journal, sorted. Empties are
 * dropped: an empty option value reads as "nothing selected" to the filter's
 * Radix `Select`, so one blank ESI row would give the list an entry that blanks
 * the control when picked.
 */
export function journalRefTypes(entries: readonly JournalRow[]): string[] {
  return [...new Set(entries.map(journalRefKey))].filter(Boolean).sort();
}

/**
 * How many criteria are active — what the mobile `FilterBar` trigger counts.
 * Text is excluded: the search box stays visible in the row at every width, so
 * counting it on the trigger would attribute a filter to a control that is not
 * behind it.
 */
export function activeWalletJournalFilterCount(filter: WalletJournalFilter): number {
  return [filter.refType, filter.startDate, filter.endDate, filter.player].filter((v) => v !== null)
    .length;
}
