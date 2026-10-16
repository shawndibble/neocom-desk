/**
 * Local wallet journal and transaction archive (issue #3909). ESI serves only
 * ~30 days of each; every fetch upserts its rows here (keyed by ESI id per
 * Character, never capped by count) and rows older than 365 days are pruned.
 * Coverage windows record what a complete fetch actually saw, so the Journal
 * can state its real reach and any gap. Device-local, not synced, not in the
 * encrypted backup — same footing as the mining ledger history.
 */
import { captureException } from '@sentry/react';
import { db } from '@/db';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import type { CachedResult } from '@/esi/cache';
import {
  ARCHIVE_DAYS,
  addCoverage,
  archiveGaps,
  archiveRanges,
  archiveSince,
  fetchWindow,
} from '@/engine/wallet/archiveCoverage';

const DAY_MS = 86_400_000;

type Kind = 'journal' | 'transactions';

/** ESI dates are second-resolution `…Z`; match that shape so string compares agree. */
function cutoffIso(nowMs: number): string {
  return `${new Date(nowMs - ARCHIVE_DAYS * DAY_MS).toISOString().slice(0, 19)}Z`;
}

function oldestMs(rows: ReadonlyArray<{ date: string }>): number | null {
  let oldest: number | null = null;
  for (const row of rows) {
    const ms = Date.parse(row.date);
    if (Number.isFinite(ms) && (oldest === null || ms < oldest)) oldest = ms;
  }
  return oldest;
}

async function recordCoverage(
  characterId: number,
  kind: Kind,
  result: CachedResult<ReadonlyArray<{ date: string }>>,
  cursor: boolean
): Promise<void> {
  // A saved copy proves nothing about the window it is read in.
  if (result.fromCache) return;
  const fetchedAt = result.fetchedAt.getTime();
  const window = fetchWindow({
    fetchedAt,
    truncated: result.truncated,
    oldestEntryMs: oldestMs(result.data),
    cursor,
  });
  // A failed page proves nothing: its window is simply not marked covered.
  if (!window) return;
  const existing = await db.walletArchiveCoverage.get([characterId, kind]);
  await db.walletArchiveCoverage.put({
    characterId,
    kind,
    windows: addCoverage(existing?.windows ?? [], window, fetchedAt),
  });
}

/** Upserts a fetched journal, records what it covered and prunes past a year. Never throws. */
export async function archiveJournal(
  characterId: number,
  result: CachedResult<WalletJournalEntry[]> | null
): Promise<void> {
  if (!result) return;
  try {
    await db.walletJournalArchive.bulkPut(result.data.map((entry) => ({ ...entry, characterId })));
    await db.walletJournalArchive
      .where('[characterId+date]')
      .between([characterId, ''], [characterId, cutoffIso(Date.now())], true, false)
      .delete();
    await recordCoverage(characterId, 'journal', result, false);
  } catch (error) {
    captureException(error);
  }
}

/** Same as `archiveJournal`, for wallet transactions (a `from_id` cursor walk). */
export async function archiveTransactions(
  characterId: number,
  result: CachedResult<WalletTransaction[]> | null
): Promise<void> {
  if (!result) return;
  try {
    await db.walletTransactionArchive.bulkPut(result.data.map((txn) => ({ ...txn, characterId })));
    await db.walletTransactionArchive
      .where('[characterId+date]')
      .between([characterId, ''], [characterId, cutoffIso(Date.now())], true, false)
      .delete();
    await recordCoverage(characterId, 'transactions', result, true);
  } catch (error) {
    captureException(error);
  }
}

/** Live rows plus archived rows ESI no longer returns; the live copy wins on a shared id. */
export function unionById<T>(
  live: readonly T[],
  archived: readonly T[],
  idOf: (row: T) => number
): T[] {
  const liveIds = new Set(live.map(idOf));
  return [...live, ...archived.filter((row) => !liveIds.has(idOf(row)))];
}

function stripCharacter<T extends { characterId: number }>(row: T): Omit<T, 'characterId'> {
  const rest: Partial<T> = { ...row };
  delete rest.characterId;
  return rest as Omit<T, 'characterId'>;
}

async function archivedJournal(characterId: number): Promise<WalletJournalEntry[]> {
  const rows = await db.walletJournalArchive.where('characterId').equals(characterId).toArray();
  return rows.map((row) => stripCharacter(row) as WalletJournalEntry);
}

async function archivedTransactions(characterId: number): Promise<WalletTransaction[]> {
  const rows = await db.walletTransactionArchive.where('characterId').equals(characterId).toArray();
  return rows.map((row) => stripCharacter(row) as WalletTransaction);
}

/** The live result with archived rows folded in; a result built from the archive alone when nothing live came back. */
async function withArchive<T>(
  live: CachedResult<T[]> | null,
  read: () => Promise<T[]>,
  idOf: (row: T) => number
): Promise<CachedResult<T[]> | null> {
  let archived: T[];
  try {
    archived = await read();
  } catch (error) {
    captureException(error);
    return live;
  }
  if (live) {
    return archived.length === 0 ? live : { ...live, data: unionById(live.data, archived, idOf) };
  }
  if (archived.length === 0) return null;
  return { data: archived, fetchedAt: new Date(), fromCache: true, truncated: false };
}

export function journalWithArchive(
  characterId: number,
  live: CachedResult<WalletJournalEntry[]> | null
): Promise<CachedResult<WalletJournalEntry[]> | null> {
  return withArchive(
    live,
    () => archivedJournal(characterId),
    (row) => row.id
  );
}

export function transactionsWithArchive(
  characterId: number,
  live: CachedResult<WalletTransaction[]> | null
): Promise<CachedResult<WalletTransaction[]> | null> {
  return withArchive(
    live,
    () => archivedTransactions(characterId),
    (row) => row.transaction_id
  );
}

export interface WalletArchiveInfo {
  /** Epoch ms the archive's first covered window starts, null when nothing is covered. */
  since: number | null;
  /** Uncovered stretches between covered windows, `[fromMs, toMs]`. */
  gaps: Array<[number, number]>;
  /** Preset ranges in days the archive reaches back far enough to fill. */
  ranges: number[];
}

/** What the Journal's history line states: reach, gaps and offered ranges. */
export async function loadWalletArchiveInfo(
  characterId: number,
  nowMs: number = Date.now()
): Promise<WalletArchiveInfo> {
  const row = await db.walletArchiveCoverage.get([characterId, 'journal']);
  const windows = row?.windows ?? [];
  return {
    since: archiveSince(windows),
    gaps: archiveGaps(windows),
    ranges: archiveRanges(windows, nowMs),
  };
}

/** Drops a Character's archive rows and coverage. Call inside a Dexie transaction that includes these tables. */
export async function clearWalletArchive(characterId: number): Promise<void> {
  await db.walletJournalArchive.where('characterId').equals(characterId).delete();
  await db.walletTransactionArchive.where('characterId').equals(characterId).delete();
  await db.walletArchiveCoverage.where('characterId').equals(characterId).delete();
}
