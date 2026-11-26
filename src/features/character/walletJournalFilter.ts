import type { TFunction } from 'i18next';
import { activeDateRangeFilters, type ActiveFilter } from '@/components/ui';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { defineUrlFilter, nullableTextParam, textParam } from '@/lib/urlState';
import { journalRefKey, type JournalRow } from '@/engine/journalNetting';
import { bountyKillsOf } from './bountyKills';
import { dailyGoalMessageIdOf } from './dailyGoal';
import { journalRefLabel } from './journalRefLabel';

export interface WalletJournalFilter {
  refType: string | null;
  startDate: string | null;
  endDate: string | null;
  player: string | null;
  party: string | null;
  text: string;
}

export const EMPTY_WALLET_JOURNAL_FILTER: WalletJournalFilter = {
  refType: null,
  startDate: null,
  endDate: null,
  player: null,
  party: null,
  text: '',
};

export const {
  schema: JOURNAL_FILTER_PARAMS,
  fieldToParam: JOURNAL_FIELD_TO_PARAM,
  emptyParams: EMPTY_JOURNAL_FILTER_PARAMS,
} = defineUrlFilter<WalletJournalFilter>({
  refType: { key: 'journal.refType', codec: nullableTextParam() },
  startDate: { key: 'journal.start', codec: nullableTextParam() },
  endDate: { key: 'journal.end', codec: nullableTextParam() },
  player: { key: 'journal.player', codec: nullableTextParam() },
  party: { key: 'journal.party', codec: nullableTextParam() },
  text: { key: 'journal.q', codec: textParam() },
});

export function filterWalletJournal<
  T extends WalletJournalEntry & Pick<JournalRow, 'playerId' | 'partyId'>,
>(
  entries: readonly T[],
  filter: WalletJournalFilter,
  describe: (entry: WalletJournalEntry) => string = (entry) => entry.description
): T[] {
  const text = filter.text.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.refType !== null && journalRefKey(entry) !== filter.refType) return false;
    if (filter.player !== null && entry.playerId?.toString() !== filter.player) return false;
    if (filter.party !== null && entry.partyId?.toString() !== filter.party) return false;
    const day = entry.date.slice(0, 10);
    if (filter.startDate !== null && day < filter.startDate) return false;
    if (filter.endDate !== null && day > filter.endDate) return false;
    if (
      text !== '' &&
      !describe(entry).toLowerCase().includes(text) &&
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
  income: number;
  expense: number;
  net: number;
  count: number;
}

export interface JournalBreakdown {
  totalIn: number;
  totalOut: number;
  net: number;
  rows: RefTypeBreakdownRow[];
  internalCount: number;
}

export function journalNet(entries: readonly JournalRow[]): number {
  return entries.reduce((sum, entry) => (entry.internal ? sum : sum + (entry.amount ?? 0)), 0);
}

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

export const MARKET_TRADES_REF_TYPE = 'market_transaction';

export interface PartyBreakdownRow {
  key: string;
  partyId: number | null;
  income: number;
  expense: number;
  net: number;
  count: number;
}

export const MARKET_TRADES_KEY = 'market';

export function journalPartyBreakdown(entries: readonly JournalRow[]): PartyBreakdownRow[] {
  const byParty = new Map<string, PartyBreakdownRow>();
  for (const entry of entries) {
    if (entry.internal) continue;
    const market = journalRefKey(entry) === MARKET_TRADES_REF_TYPE;
    if (!market && entry.partyId === undefined) continue;
    const key = market ? MARKET_TRADES_KEY : String(entry.partyId);
    const row = byParty.get(key) ?? {
      key,
      partyId: market ? null : (entry.partyId as number),
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
    };
    const amount = entry.amount ?? 0;
    if (amount > 0) row.income += amount;
    else row.expense -= amount;
    row.net += amount;
    row.count += 1;
    byParty.set(key, row);
  }
  return [...byParty.values()].sort(
    (a, b) => Math.abs(b.net) - Math.abs(a.net) || a.key.localeCompare(b.key)
  );
}

export function toggleBreakdownParty(
  filter: WalletJournalFilter,
  partyId: number
): WalletJournalFilter {
  const party = String(partyId);
  return { ...filter, party: filter.party === party ? null : party };
}

export function toggleBreakdownRefType(
  filter: WalletJournalFilter,
  refType: string
): WalletJournalFilter {
  return { ...filter, refType: filter.refType === refType ? null : refType };
}

export function journalRefTypes(entries: readonly JournalRow[]): string[] {
  return [...new Set(entries.map(journalRefKey))].filter(Boolean).sort();
}

interface NamedOption {
  id: string;
  name: string;
}

export function activeWalletJournalFilters(
  filter: WalletJournalFilter,
  t: TFunction,
  options: { players?: readonly NamedOption[]; parties?: readonly NamedOption[] } = {}
): ActiveFilter<WalletJournalFilter>[] {
  const nameOf = (list: readonly NamedOption[] | undefined, id: string) =>
    list?.find((option) => option.id === id)?.name ?? `#${id}`;
  const active: ActiveFilter<WalletJournalFilter>[] = [];
  if (filter.refType !== null)
    active.push({
      label: t('wallet.refTypeFilterLabel'),
      value: journalRefLabel(filter.refType, t),
      inline: true,
      clear: (value) => ({ ...value, refType: null }),
    });
  if (filter.player !== null)
    active.push({
      label: t('wallet.playerFilterLabel'),
      value: nameOf(options.players, filter.player),
      clear: (value) => ({ ...value, player: null }),
    });
  if (filter.party !== null)
    active.push({
      label: t('wallet.partyFilterLabel'),
      value: nameOf(options.parties, filter.party),
      clear: (value) => ({ ...value, party: null }),
    });
  active.push(
    ...activeDateRangeFilters(filter, t, {
      from: t('wallet.dateFromLabel'),
      to: t('wallet.dateToLabel'),
    })
  );
  return active;
}
