import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import type {
  SrpApproveItem,
  SrpAuditEntry,
  SrpBatchOutcome,
  SrpClaim,
  SrpClaimOutcome,
  SrpMarkPaidItem,
} from '../srpClaimTypes';
import { verifySrpOfficer } from '../srpClient';
import {
  approveSrpClaim,
  approveSrpClaims,
  changeSrpClaimAmount,
  markSrpClaimPaid,
  markSrpClaimsPaid,
  getSrpClaimValues,
  readSrpActivity,
  readSrpClaimAudit,
  readSrpClaims,
  readSrpHistory,
  rejectSrpClaim,
} from '../srpOfficerClient';
import type { SrpClaimValues } from '../srpTypes';
import { runInBatches } from './srpQueue';

export type SrpHistoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; claims: SrpClaim[]; limit: number; more: boolean };

export type SrpQueueState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'failed'; message: string }
  | {
      status: 'ready';
      claims: SrpClaim[];
      activity: SrpAuditEntry[];
      history: SrpHistoryState;
    };

type ReadyState = Extract<SrpQueueState, { status: 'ready' }>;

export interface SrpQueueData {
  state: SrpQueueState;
  reload: () => void;
  loadHistory: () => void;
  loadOlderHistory: () => void;
  approve: (item: SrpApproveItem) => Promise<SrpClaimOutcome>;
  approveMany: (items: SrpApproveItem[]) => Promise<SrpBatchOutcome>;
  reject: (killmailId: number, reason: string) => Promise<SrpClaimOutcome>;
  change: (killmailId: number, amount: number, reason: string) => Promise<SrpClaimOutcome>;
  markPaid: (item: SrpMarkPaidItem) => Promise<SrpClaimOutcome>;
  markPaidMany: (items: SrpMarkPaidItem[]) => Promise<SrpBatchOutcome>;
  claimAudit: (killmailId: number) => Promise<SrpAuditEntry[]>;
  claimValues: (killmailId: number) => Promise<SrpClaimValues>;
}

const DENIED = /permission-denied|unauthenticated|failed-precondition/;
const HISTORY_PAGE = 100;

export function applyOutcomes(
  ready: ReadyState,
  outcomes: readonly SrpClaimOutcome[],
  now: number
): ReadyState {
  const byId = new Map(outcomes.map((o) => [o.killmailId, o]));
  const closed: SrpClaim[] = [];
  const claims = ready.claims.flatMap((c) => {
    const o = byId.get(c.killmailId);
    if (!o) return [c];
    const next: SrpClaim = { ...c, state: o.state, amount: o.amount ?? c.amount };
    if (o.state === 'approved') next.decidedAt = now;
    if (o.state === 'paid' || o.state === 'rejected') {
      next.closedAt = now;
      if (o.state === 'paid') next.paidAt = now;
      else if (o.reason !== undefined) next.rejectionReason = o.reason;
      closed.push(next);
      return [];
    }
    return [next];
  });
  const history: SrpHistoryState =
    ready.history.status === 'ready' && closed.length > 0
      ? { ...ready.history, claims: [...closed, ...ready.history.claims] }
      : ready.history;
  return { ...ready, claims, history };
}

export function useSrpQueue(): SrpQueueData {
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const key =
    characterId === null || corporationId === null ? null : `${characterId}:${corporationId}`;
  const [loaded, setLoaded] = useState<{ key: string; state: SrpQueueState } | null>(null);
  const state = useMemo<SrpQueueState>(
    () => (loaded !== null && loaded.key === key ? loaded.state : { status: 'loading' }),
    [loaded, key]
  );
  const setState = useCallback(
    (next: SrpQueueState) => key !== null && setLoaded({ key, state: next }),
    [key]
  );
  const patchReady = useCallback(
    (change: (ready: ReadyState) => ReadyState) =>
      setLoaded((prev) =>
        prev !== null && prev.key === key && prev.state.status === 'ready'
          ? { key: prev.key, state: change(prev.state) }
          : prev
      ),
    [key]
  );
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (characterId === null || corporationId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const verdict = await verifySrpOfficer(characterId, corporationId);
        if (cancelled) return;
        if (!verdict.canManage) {
          setState({ status: 'denied' });
          return;
        }
        const [claims, activity] = await Promise.all([
          readSrpClaims(characterId, corporationId),
          readSrpActivity(characterId, corporationId),
        ]);
        if (!cancelled)
          setState({ status: 'ready', claims, activity, history: { status: 'idle' } });
      } catch (error) {
        if (cancelled) return;
        const code = (error as { code?: string }).code ?? '';
        setState(
          DENIED.test(code)
            ? { status: 'denied' }
            : { status: 'failed', message: error instanceof Error ? error.message : String(error) }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, attempt, setState]);

  const refresh = useCallback(
    async (claims: boolean) => {
      if (characterId === null || corporationId === null) return;
      try {
        const [nextClaims, activity] = await Promise.all([
          claims ? readSrpClaims(characterId, corporationId) : null,
          readSrpActivity(characterId, corporationId),
        ]);
        patchReady((ready) => ({ ...ready, claims: nextClaims ?? ready.claims, activity }));
      } catch {}
    },
    [characterId, corporationId, patchReady]
  );

  const readHistory = useCallback(
    async (limit: number) => {
      if (characterId === null || corporationId === null) return;
      patchReady((ready) => ({ ...ready, history: { status: 'loading' } }));
      try {
        const claims = await readSrpHistory(characterId, corporationId, limit);
        patchReady((ready) => ({
          ...ready,
          history: { status: 'ready', claims, limit, more: claims.length >= limit },
        }));
      } catch {
        patchReady((ready) => ({ ...ready, history: { status: 'failed' } }));
      }
    },
    [characterId, corporationId, patchReady]
  );

  const loadHistory = useCallback(() => {
    if (state.status !== 'ready') return;
    if (state.history.status === 'idle' || state.history.status === 'failed') {
      void readHistory(HISTORY_PAGE);
    }
  }, [state, readHistory]);

  const loadOlderHistory = useCallback(() => {
    if (state.status === 'ready' && state.history.status === 'ready') {
      void readHistory(state.history.limit + HISTORY_PAGE);
    }
  }, [state, readHistory]);

  const act = useCallback(
    async <T>(
      run: (c: number, corp: number) => Promise<T>,
      outcomes: (out: T) => { applied: SrpClaimOutcome[]; refused: boolean }
    ): Promise<T> => {
      if (characterId === null || corporationId === null) throw new Error('no character');
      let out: T;
      try {
        out = await run(characterId, corporationId);
      } catch (error) {
        void refresh(true);
        throw error;
      }
      const { applied, refused } = outcomes(out);
      if (applied.length > 0) patchReady((ready) => applyOutcomes(ready, applied, Date.now()));
      void refresh(refused);
      return out;
    },
    [characterId, corporationId, patchReady, refresh]
  );

  const one = (out: SrpClaimOutcome) => ({ applied: [out], refused: false });
  const many = (out: SrpBatchOutcome) => ({
    applied: out.results.flatMap((r) => (r.ok ? [r] : [])),
    refused: out.results.some((r) => !r.ok),
  });

  const claimAudit = useCallback(
    async (id: number) => {
      if (characterId === null || corporationId === null) return [];
      return readSrpClaimAudit(characterId, corporationId, id);
    },
    [characterId, corporationId]
  );

  const claimValues = useCallback(
    async (id: number): Promise<SrpClaimValues> => {
      if (characterId === null || corporationId === null) {
        return { hullValue: null, fitValue: null, doctrineValue: null };
      }
      return getSrpClaimValues(characterId, corporationId, id);
    },
    [characterId, corporationId]
  );

  return {
    state,
    reload,
    loadHistory,
    loadOlderHistory,
    approve: (item) => act((c, corp) => approveSrpClaim(c, corp, item), one),
    approveMany: (items) =>
      act((c, corp) => runInBatches(items, (chunk) => approveSrpClaims(c, corp, chunk)), many),
    reject: (id, reason) => act((c, corp) => rejectSrpClaim(c, corp, id, reason), one),
    change: (id, amount, reason) =>
      act((c, corp) => changeSrpClaimAmount(c, corp, id, amount, reason), one),
    markPaid: (item) => act((c, corp) => markSrpClaimPaid(c, corp, item), one),
    markPaidMany: (items) =>
      act((c, corp) => runInBatches(items, (chunk) => markSrpClaimsPaid(c, corp, chunk)), many),
    claimAudit,
    claimValues,
  };
}
