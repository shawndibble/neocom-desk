import {
  loadWalletBalanceWithStatus,
  loadWalletJournalHistory,
  loadWalletTransactionsHistory,
} from '@/features/character/wallet';
import { loadCharacterLoyaltyPoints } from '@/features/character/loyalty';
import { resolveNames } from '@/features/character/names';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadWalletArchiveInfo, type WalletArchiveInfo } from '@/features/character/walletArchive';
import type { CachedResult } from '@/esi/cache';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import type {
  CharacterLoyaltyPoints,
  WalletJournalEntry,
  WalletTransactionCommon,
} from '@/esi/endpoints';

/** Stable identity, so a missing journal doesn't invalidate its dependent memos every render. */
export const EMPTY_JOURNAL: readonly WalletJournalEntry[] = [];
/** Same, for the personal fills the journal links its market lines to. */
export const EMPTY_FILLS: readonly (WalletTransactionCommon & { characterId?: number })[] = [];

export interface WalletSnapshot {
  balanceResult: CachedResult<number> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  balanceNeedsReauth: boolean;
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  journalNeedsReauth: boolean;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  journalTruncated: boolean;
  /** What the device-kept history reaches back to. */
  archive: WalletArchiveInfo;
  loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  loyaltyNeedsReauth: boolean;
  corporationNames: Map<number, string>;
}

export async function loadWalletSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<WalletSnapshot> {
  const [balanceStatus, journalStatus, loyaltyStatus] = await Promise.all([
    loadWalletBalanceWithStatus(characterId),
    loadWalletJournalHistory(characterId),
    loadCharacterLoyaltyPoints(characterId),
  ]);
  // After the journal load: that fetch is what extends the coverage read here.
  const archive = await loadWalletArchiveInfo(characterId);
  const { cached: balanceResult, needsReauth: balanceNeedsReauth } = balanceStatus;
  const { cached: loyaltyResult, needsReauth: loyaltyNeedsReauth } = loyaltyStatus;
  const { cached: journalResult, needsReauth: journalNeedsReauth } = journalStatus;
  const journalTruncated = journalResult?.truncated ?? false;
  // Already superseded: skip the ESI name resolve, its result would be discarded.
  const corporationIds = signal.cancelled
    ? []
    : (loyaltyResult?.data ?? []).map((entry) => entry.corporation_id);
  const corporationNames = await resolveNames(corporationIds);
  return {
    balanceResult,
    balanceNeedsReauth,
    journalResult,
    journalNeedsReauth,
    journalTruncated,
    archive,
    loyaltyResult,
    loyaltyNeedsReauth,
    corporationNames,
  };
}

/**
 * The Character's recent fills, read only so a journal line can name the item
 * behind it (the fills themselves are listed on Market's History tab). Its
 * own load, not part of `loadWalletSnapshot`: the Balance tab would
 * otherwise wait on a cursor walk it never shows.
 */
export interface PersonalFillsSnapshot {
  transactions: readonly WalletTransactionCommon[];
  typeNames: Map<number, string>;
  /** The fetch stopped at its page cap: older journal lines stay unnamed. */
  truncated: boolean;
}

export async function loadPersonalFills(characterId: number): Promise<PersonalFillsSnapshot> {
  const result = await loadWalletTransactionsHistory(characterId);
  const transactions = result?.data ?? [];
  const typeNames = await loadTypeNames([...new Set(transactions.map((txn) => txn.type_id))]);
  return { transactions, typeNames, truncated: result?.truncated ?? false };
}
