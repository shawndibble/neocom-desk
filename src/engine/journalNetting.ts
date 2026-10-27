/**
 * Wallet journal classification (issue #3908): which lines are ISK moved
 * between the pilot's own Characters, and which market lines are PLEX.
 *
 * Pure: the caller supplies the tracked Character ids and the journal-to-fill
 * lookup. A line is internal when both parties are tracked Characters, i.e.
 * any Character with the wallet permission, whether or not it is in the
 * current Character pick: a donation from your own alt is internal even in the
 * one-Character view. Corporation wallets are never Characters, so ISK moved
 * through one is not netted.
 */
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';

export const PLEX_BOUGHT_KEY = 'plex_bought';
export const PLEX_SOLD_KEY = 'plex_sold';

/** A journal line tagged with the Character whose wallet it came from. */
export type OwnedJournalEntry = WalletJournalEntry & { characterId: number };

/** A journal line, tagged with its Character in the multi-Character view. */
export type JournalLine = WalletJournalEntry & { characterId?: number };

/** A journal line plus what the Journal derives from it. */
export type JournalRow = WalletJournalEntry & {
  characterId?: number;
  /** The corp journal's Player: the character party of the line, when it has one. */
  playerId?: number;
  /** Both parties are the pilot's own Characters: left out of In, Out and the ref-type rows. */
  internal?: boolean;
  /** Replaces `ref_type` for grouping and filtering: PLEX bought or sold. */
  refKey?: string;
};

/** The ref type a row groups and filters under. */
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

/** PLEX bought or sold on the market: a `market_transaction` line whose linked fill is PLEX. */
function plexKey(
  entry: JournalLine,
  linkFor: (entry: JournalLine) => WalletTransactionCommon | undefined
): string | undefined {
  if (entry.ref_type !== 'market_transaction') return undefined;
  const fill = linkFor(entry);
  if (!fill || fill.type_id !== PLEX_TYPE_ID) return undefined;
  return fill.is_buy ? PLEX_BOUGHT_KEY : PLEX_SOLD_KEY;
}

export interface ClassifyContext {
  /** Wallet-scoped Characters; a party outside it is not "yours". */
  trackedIds: ReadonlySet<number>;
  linkFor: (entry: JournalLine) => WalletTransactionCommon | undefined;
}

export function classifyJournal(
  entries: readonly JournalLine[],
  { trackedIds, linkFor }: ClassifyContext
): JournalRow[] {
  return entries.map((entry) => {
    const row: JournalRow = { ...entry };
    if (isInternalTransfer(entry, trackedIds)) row.internal = true;
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

/** "N of M Characters loaded": every tracked Character against those whose journal is in. */
export function journalCoverage(
  tracked: readonly { characterId: number; name: string }[],
  loadedIds: ReadonlySet<number>
): JournalCoverage {
  const missing = tracked.filter((c) => !loadedIds.has(c.characterId));
  return { loaded: tracked.length - missing.length, total: tracked.length, missing };
}
