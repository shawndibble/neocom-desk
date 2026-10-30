/**
 * The officer sync as a hook (issue #4062, D9): "Last synced 3d ago by X", the
 * stale warning, the gaps, and a sync that runs by itself when an officer
 * visits. The screens (`/corp/moons`, #4063) read this and render.
 *
 * The run state lives in a small store keyed by corporation, so every
 * component showing the book sees one sync in flight rather than starting its
 * own, and a sync survives the page that began it unmounting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { syncStatus, type SyncStatus } from '@/engine/corpTaxBook/sync';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import { useCorpAccess } from '../useCorpAccess';
import { readBookSummary, type BookSummary } from './bookClient';
import { useMiningLedgerAccess, type MiningLedgerAccess } from './miningLedgerAccess';
import {
  syncCorpTaxBook,
  type SyncCapabilities,
  type SyncDeps,
  type SyncOutcome,
} from './syncCorpTaxBook';
import { MINUTE_MS } from '@/lib/age';

/**
 * A visit within this long of the last sync (by anyone) does not sync again:
 * the observer endpoints cache for an hour, so there is nothing newer to fetch.
 */
export const AUTO_SYNC_MIN_AGE_MS = 15 * MINUTE_MS;

export type SyncRun =
  | { phase: 'idle' }
  | { phase: 'syncing' }
  | { phase: 'done'; outcome: SyncOutcome; finishedAt: number }
  | { phase: 'failed'; message: string; finishedAt: number };

interface RunStore {
  byCorp: Record<number, SyncRun>;
  set: (corporationId: number, run: SyncRun) => void;
}

export const useTaxBookRuns = create<RunStore>((set) => ({
  byCorp: {},
  set: (corporationId, run) => set((s) => ({ byCorp: { ...s.byCorp, [corporationId]: run } })),
}));

const inflight = new Map<number, Promise<void>>();

/** Runs a sync unless one is already running for this corporation, and files the result in the store. */
export function runTaxBookSync(
  args: { characterId: number; corporationId: number; capabilities: SyncCapabilities },
  deps?: SyncDeps
): Promise<void> {
  const running = inflight.get(args.corporationId);
  if (running) return running;
  const { set } = useTaxBookRuns.getState();
  set(args.corporationId, { phase: 'syncing' });
  const task = syncCorpTaxBook(args, deps)
    .then((outcome) => set(args.corporationId, { phase: 'done', outcome, finishedAt: Date.now() }))
    .catch((error: unknown) =>
      set(args.corporationId, {
        phase: 'failed',
        message: error instanceof Error ? error.message : String(error),
        finishedAt: Date.now(),
      })
    )
    .finally(() => inflight.delete(args.corporationId));
  inflight.set(args.corporationId, task);
  return task;
}

/** Whether a visit should sync by itself. */
export function shouldAutoSync(summary: BookSummary | null, now: number): boolean {
  if (!summary?.active) return false;
  return !summary.lastSync || now - summary.lastSync.at >= AUTO_SYNC_MIN_AGE_MS;
}

export interface CorpTaxBookSync {
  /** The book's settings; null when the corporation has no book (or while loading). */
  summary: BookSummary | null;
  loading: boolean;
  /** "Last synced 3d ago by X", stale after about 3 days, and the gaps on record. */
  status: SyncStatus;
  run: SyncRun;
  /** `needs-scope` means the first ledger screen should offer the mining scope. */
  ledger: MiningLedgerAccess & { request: () => Promise<void> };
  /** Syncs now. The page's own refresh action. */
  sync: () => Promise<void>;
}

export function useCorpTaxBook(options: { autoSync?: boolean } = {}): CorpTaxBookSync {
  const { autoSync = true } = options;
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const access = useCorpAccess();
  const ledger = useMiningLedgerAccess();
  const run = useTaxBookRuns((s) => (corporationId === null ? undefined : s.byCorp[corporationId]));
  const [summary, setSummary] = useState<BookSummary | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // A finished sync changes the book's last-synced record, so it re-reads the summary.
  const finishedAt = run && 'finishedAt' in run ? run.finishedAt : 0;
  const key =
    characterId === null || corporationId === null ? null : `${characterId}:${corporationId}`;

  useEffect(() => {
    if (characterId === null || corporationId === null || key === null) return;
    let cancelled = false;
    readBookSummary(characterId, corporationId).then(
      (s) => {
        if (cancelled) return;
        setSummary(s);
        setNow(Date.now());
        setLoadedFor(key);
      },
      () => {
        if (!cancelled) setLoadedFor(key);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, key, finishedAt]);

  const capabilities = access.capabilities;
  const canSync = ledger.state === 'ready' && characterId !== null && corporationId !== null;
  const sync = useCallback(async () => {
    if (!canSync) return;
    await runTaxBookSync({ characterId, corporationId, capabilities });
  }, [canSync, characterId, corporationId, capabilities]);

  const visited = useRef<string | null>(null);
  const loaded = key !== null && loadedFor === key;
  useEffect(() => {
    if (!autoSync || !canSync || !loaded || key === null || visited.current === key) return;
    visited.current = key;
    if (shouldAutoSync(summary, now)) void sync();
  }, [autoSync, canSync, loaded, key, summary, now, sync]);

  return {
    summary: loaded ? summary : null,
    loading: key !== null && !loaded,
    status: syncStatus(loaded ? summary?.lastSync : null, now),
    run: run ?? { phase: 'idle' },
    ledger,
    sync,
  };
}
