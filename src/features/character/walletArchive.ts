/**
 * Local wallet journal and transaction archive. ESI serves only ~30 days of
 * each; every fetch upserts its rows here (keyed by ESI id per Character,
 * never capped by count) and rows older than 365 days are pruned. Coverage
 * windows record what a complete fetch actually saw, so the Journal can state
 * its real reach and any gap. Device-local, not synced, not in the encrypted
 * backup — same footing as the mining ledger history.
 */
import { captureException } from '@sentry/react';
import type Dexie from 'dexie';
import { db, type ArchiveKind } from '@/db';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import type { CachedResult } from '@/esi/cache';
import {
  addCoverage,
  archiveCutoffIso,
  archiveGaps,
  archiveSince,
  fetchWindow,
} from '@/engine/wallet/archiveCoverage';

interface ArchiveRow {
  characterId: number;
  date: string;
}
type ArchiveTable = Dexie.Table<ArchiveRow, [number, number]>;

const KINDS: Record<ArchiveKind, { table: () => ArchiveTable; cursor: boolean }> = {
  journal: { table: () => db.walletJournalArchive as unknown as ArchiveTable, cursor: false },
  // Transactions walk a `from_id` cursor, newest first.
  transactions: {
    table: () => db.walletTransactionArchive as unknown as ArchiveTable,
    cursor: true,
  },
};

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
  kind: ArchiveKind,
  result: CachedResult<ReadonlyArray<{ date: string }>>
): Promise<void> {
  const fetchedAt = result.fetchedAt.getTime();
  // A saved copy proves nothing about the window it is read in, and a failed
  // page proves nothing about which stretch was lost.
  const window = result.fromCache
    ? null
    : fetchWindow({
        fetchedAt,
        truncated: result.truncated,
        oldestEntryMs: oldestMs(result.data),
        cursor: KINDS[kind].cursor,
      });
  // One transaction: concurrent loaders must not overwrite each other's window.
  await db.transaction('rw', db.walletArchiveCoverage, async () => {
    const existing = await db.walletArchiveCoverage.get([characterId, kind]);
    const windows = existing?.windows ?? [];
    await db.walletArchiveCoverage.put({
      characterId,
      kind,
      windows: window ? addCoverage(windows, window, fetchedAt) : windows,
      archivedAt: Math.max(existing?.archivedAt ?? 0, fetchedAt),
    });
  });
}

/**
 * Upserts a fetched list, records what it covered and prunes past a year,
 * then hands the result back. Never throws. A result no newer than the last
 * archived one is skipped: the cache replays the same rows until it refetches.
 */
export async function archiveResult<T extends { date: string }>(
  kind: ArchiveKind,
  characterId: number,
  result: CachedResult<T[]> | null
): Promise<CachedResult<T[]> | null> {
  if (!result) return result;
  try {
    const last = await db.walletArchiveCoverage.get([characterId, kind]);
    if (last?.archivedAt !== undefined && last.archivedAt >= result.fetchedAt.getTime()) {
      return result;
    }
    const table = KINDS[kind].table();
    await table.bulkPut(result.data.map((row) => ({ ...row, characterId })));
    await table
      .where('[characterId+date]')
      .between([characterId, ''], [characterId, archiveCutoffIso(Date.now())], true, false)
      .delete();
    await recordCoverage(characterId, kind, result);
  } catch (error) {
    captureException(error);
  }
  return result;
}

function unionById<T>(live: readonly T[], archived: readonly T[], idOf: (row: T) => number): T[] {
  const liveIds = new Set(live.map(idOf));
  return [...live, ...archived.filter((row) => !liveIds.has(idOf(row)))];
}

function stripCharacter<T extends { characterId: number }>(row: T): Omit<T, 'characterId'> {
  const rest: Partial<T> = { ...row };
  delete rest.characterId;
  return rest as Omit<T, 'characterId'>;
}

async function archivedRows<T>(kind: ArchiveKind, characterId: number): Promise<T[]> {
  const rows = await KINDS[kind].table().where('characterId').equals(characterId).toArray();
  return rows.map((row) => stripCharacter(row) as unknown as T);
}

/** When the archive last saw the list: newest window end, else the newest row. */
async function archiveFreshness(
  kind: ArchiveKind,
  characterId: number,
  rows: ReadonlyArray<{ date: string }>
): Promise<Date> {
  const coverage = await db.walletArchiveCoverage.get([characterId, kind]);
  const newestEnd = Math.max(0, ...(coverage?.windows ?? []).map(([, to]) => to));
  if (newestEnd > 0) return new Date(newestEnd);
  return new Date(Math.max(0, ...rows.map((row) => Date.parse(row.date)).filter(Number.isFinite)));
}

/** The live result with archived rows folded in; a result built from the archive alone when nothing live came back. */
async function withArchive<T extends { date: string }>(
  kind: ArchiveKind,
  characterId: number,
  live: CachedResult<T[]> | null,
  idOf: (row: T) => number
): Promise<CachedResult<T[]> | null> {
  let archived: T[];
  try {
    archived = await archivedRows<T>(kind, characterId);
  } catch (error) {
    captureException(error);
    return live;
  }
  if (live) {
    return archived.length === 0 ? live : { ...live, data: unionById(live.data, archived, idOf) };
  }
  if (archived.length === 0) return null;
  // Stamped with what was seen, not now: Data Age must not claim a fresh fetch.
  return {
    data: archived,
    fetchedAt: await archiveFreshness(kind, characterId, archived),
    fromCache: true,
    truncated: false,
  };
}

export function journalWithArchive(
  characterId: number,
  live: CachedResult<WalletJournalEntry[]> | null
): Promise<CachedResult<WalletJournalEntry[]> | null> {
  return withArchive('journal', characterId, live, (row) => row.id);
}

export function transactionsWithArchive(
  characterId: number,
  live: CachedResult<WalletTransaction[]> | null
): Promise<CachedResult<WalletTransaction[]> | null> {
  return withArchive('transactions', characterId, live, (row) => row.transaction_id);
}

export interface WalletArchiveInfo {
  /** Epoch ms the archive's first covered window starts, null when nothing is covered. */
  since: number | null;
  /** Uncovered stretches, `[fromMs, toMs]`, including the one up to now. */
  gaps: Array<[number, number]>;
  /** Rows are stored but no complete fetch has confirmed what they cover. */
  unconfirmed: boolean;
}

/** What the Journal's history line states: reach and gaps. */
export async function loadWalletArchiveInfo(
  characterId: number,
  nowMs: number = Date.now()
): Promise<WalletArchiveInfo> {
  const row = await db.walletArchiveCoverage.get([characterId, 'journal']);
  const windows = row?.windows ?? [];
  const unconfirmed =
    windows.length === 0 &&
    (await db.walletJournalArchive.where('characterId').equals(characterId).first()) !== undefined;
  return {
    since: archiveSince(windows),
    gaps: archiveGaps(windows, nowMs),
    unconfirmed,
  };
}

/** Drops a Character's archive rows and coverage. Call inside a Dexie transaction that includes these tables. */
export async function clearWalletArchive(characterId: number): Promise<void> {
  await db.walletJournalArchive.where('characterId').equals(characterId).delete();
  await db.walletTransactionArchive.where('characterId').equals(characterId).delete();
  await db.walletArchiveCoverage.where('characterId').equals(characterId).delete();
}
