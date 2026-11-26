import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';

export const PLEX_BOUGHT_KEY = 'plex_bought';
export const PLEX_SOLD_KEY = 'plex_sold';

export type OwnedJournalEntry = WalletJournalEntry & { characterId: number };

export type JournalLine = WalletJournalEntry & { characterId?: number };

export type JournalRow = WalletJournalEntry & {
  characterId?: number;
  playerId?: number;
  partyId?: number;
  internal?: boolean;
  refKey?: string;
};

export function journalRefKey(entry: JournalRow): string {
  return entry.refKey ?? entry.ref_type;
}

export function isInternalTransfer(entry: WalletJournalEntry, trackedIds: ReadonlySet<number>) {
  const { first_party_id: first, second_party_id: second } = entry;
  return (
    first !== undefined &&
    second !== undefined &&
    first !== second &&
    trackedIds.has(first) &&
    trackedIds.has(second)
  );
}

function plexKey(
  entry: JournalLine,
  linkFor: (entry: JournalLine) => WalletTransactionCommon | undefined
): string | undefined {
  if (entry.ref_type !== 'market_transaction') return undefined;
  const fill = linkFor(entry);
  if (!fill || fill.type_id !== PLEX_TYPE_ID) return undefined;
  return fill.is_buy ? PLEX_BOUGHT_KEY : PLEX_SOLD_KEY;
}

export function journalPartyId(entry: WalletJournalEntry, ownId: number): number | undefined {
  const others = [entry.first_party_id, entry.second_party_id].filter(
    (id): id is number => id !== undefined && id !== ownId
  );
  if (others.length < 2) return others[0];
  return (entry.amount ?? 0) >= 0 ? entry.first_party_id : entry.second_party_id;
}

export interface ClassifyContext {
  trackedIds: ReadonlySet<number>;
  linkFor: (entry: JournalLine) => WalletTransactionCommon | undefined;
  defaultCharacterId?: number;
}

export function classifyJournal(
  entries: readonly JournalLine[],
  { trackedIds, linkFor, defaultCharacterId }: ClassifyContext
): JournalRow[] {
  return entries.map((entry) => {
    const row: JournalRow = { ...entry };
    if (isInternalTransfer(entry, trackedIds)) row.internal = true;
    else {
      const ownId = entry.characterId ?? defaultCharacterId;
      const partyId = ownId === undefined ? undefined : journalPartyId(entry, ownId);
      if (partyId !== undefined) row.partyId = partyId;
    }
    const refKey = plexKey(entry, linkFor);
    if (refKey) row.refKey = refKey;
    return row;
  });
}

export interface JournalCoverage {
  loaded: number;
  total: number;
  missing: { characterId: number; name: string }[];
}

export function journalCoverage(
  tracked: readonly { characterId: number; name: string }[],
  loadedIds: ReadonlySet<number>
): JournalCoverage {
  const missing = tracked.filter((c) => !loadedIds.has(c.characterId));
  return { loaded: tracked.length - missing.length, total: tracked.length, missing };
}
