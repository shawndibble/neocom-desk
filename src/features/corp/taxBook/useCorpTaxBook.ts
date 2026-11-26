import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { syncStatus, type SyncStatus } from '@/engine/corpTaxBook/sync';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import { useCorpAccess } from '../useCorpAccess';
import { readBookSummary, type BookSummary } from './bookClient';
import { useMiningLedgerAccess, type MiningLedgerAccess } from './miningLedgerAccess';
import { pushDivisionNames } from './pushDivisionNames';
import {
  syncCorpTaxBook,
  type SyncCapabilities,
  type SyncDeps,
  type SyncOutcome,
} from './syncCorpTaxBook';
import { MINUTE_MS } from '@/lib/age';

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

export function shouldAutoSync(summary: BookSummary | null, now: number): boolean {
  if (!summary?.active) return false;
  return !summary.lastSync || now - summary.lastSync.at >= AUTO_SYNC_MIN_AGE_MS;
}

export interface CorpTaxBookSync {
  summary: BookSummary | null;
  loading: boolean;
  status: SyncStatus;
  run: SyncRun;
  ledger: MiningLedgerAccess & { request: () => Promise<void> };
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

  const canReadDivisions = access.capabilities.canReadDivisions;
  const namesPushed = useRef<string | null>(null);
  useEffect(() => {
    if (!autoSync || !canReadDivisions || !loaded || !summary?.active) return;
    if (key === null || namesPushed.current === key) return;
    if (characterId === null || corporationId === null) return;
    namesPushed.current = key;
    pushDivisionNames(characterId, corporationId, summary).catch((error: unknown) =>
      console.warn(
        'Storing the wallet division names on the Corp Tax Book failed',
        error instanceof Error ? error.message : String(error)
      )
    );
  }, [autoSync, canReadDivisions, loaded, key, summary, characterId, corporationId]);

  return {
    summary: loaded ? summary : null,
    loading: key !== null && !loaded,
    status: syncStatus(loaded ? summary?.lastSync : null, now),
    run: run ?? { phase: 'idle' },
    ledger,
    sync,
  };
}
