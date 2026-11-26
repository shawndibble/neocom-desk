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

export const EMPTY_JOURNAL: readonly WalletJournalEntry[] = [];
export const EMPTY_FILLS: readonly (WalletTransactionCommon & { characterId?: number })[] = [];

export interface WalletSnapshot {
  balanceResult: CachedResult<number> | null;
  balanceNeedsReauth: boolean;
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  journalNeedsReauth: boolean;
  journalTruncated: boolean;
  archive: WalletArchiveInfo;
  loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null;
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
  const archive = await loadWalletArchiveInfo(characterId);
  const { cached: balanceResult, needsReauth: balanceNeedsReauth } = balanceStatus;
  const { cached: loyaltyResult, needsReauth: loyaltyNeedsReauth } = loyaltyStatus;
  const { cached: journalResult, needsReauth: journalNeedsReauth } = journalStatus;
  const journalTruncated = journalResult?.truncated ?? false;
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

export interface PersonalFillsSnapshot {
  transactions: readonly WalletTransactionCommon[];
  typeNames: Map<number, string>;
  truncated: boolean;
}

export async function loadPersonalFills(characterId: number): Promise<PersonalFillsSnapshot> {
  const result = await loadWalletTransactionsHistory(characterId);
  const transactions = result?.data ?? [];
  const typeNames = await loadTypeNames([...new Set(transactions.map((txn) => txn.type_id))]);
  return { transactions, typeNames, truncated: result?.truncated ?? false };
}
