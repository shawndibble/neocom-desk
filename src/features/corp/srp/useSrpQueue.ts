/**
 * `/corp/srp` officer queue's data (issue #4853): verify the Character as an SRP officer first
 * (it records the 24-hour officer access the rules need), then read the corporation's claims and
 * its audit log. Firestore is the `lite` build with no listeners, so every action reloads. A
 * reload keeps the claims on screen until the new ones arrive.
 */
import { useCallback, useEffect, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import type {
  SrpApproveItem,
  SrpAuditEntry,
  SrpBatchOutcome,
  SrpClaim,
  SrpClaimOutcome,
} from '../srpClaimTypes';
import { verifySrpOfficer } from '../srpClient';
import {
  approveSrpClaim,
  approveSrpClaims,
  changeSrpClaimAmount,
  markSrpClaimPaid,
  markSrpClaimsPaid,
  readSrpActivity,
  readSrpClaimAudit,
  readSrpClaims,
  rejectSrpClaim,
} from '../srpOfficerClient';

export type SrpQueueState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; claims: SrpClaim[]; activity: SrpAuditEntry[] };

export interface SrpQueueData {
  state: SrpQueueState;
  reload: () => void;
  approve: (item: SrpApproveItem) => Promise<SrpClaimOutcome>;
  approveMany: (items: SrpApproveItem[]) => Promise<SrpBatchOutcome>;
  reject: (killmailId: number, reason: string) => Promise<SrpClaimOutcome>;
  change: (killmailId: number, amount: number, reason: string) => Promise<SrpClaimOutcome>;
  markPaid: (killmailId: number) => Promise<SrpClaimOutcome>;
  markPaidMany: (killmailIds: number[]) => Promise<SrpBatchOutcome>;
  /** One claim's audit trail, for its detail. */
  claimAudit: (killmailId: number) => Promise<SrpAuditEntry[]>;
}

const DENIED = /permission-denied|unauthenticated|failed-precondition/;

export function useSrpQueue(): SrpQueueData {
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const key =
    characterId === null || corporationId === null ? null : `${characterId}:${corporationId}`;
  // Tagged with the Character and corporation it was read for, so a switch shows loading, never the old corp's queue.
  const [loaded, setLoaded] = useState<{ key: string; state: SrpQueueState } | null>(null);
  const state: SrpQueueState =
    loaded !== null && loaded.key === key ? loaded.state : { status: 'loading' };
  const setState = useCallback(
    (next: SrpQueueState) => key !== null && setLoaded({ key, state: next }),
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
        if (!cancelled) setState({ status: 'ready', claims, activity });
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

  // Whatever the call did (even a refusal means the claim moved), show what the server holds.
  const act = useCallback(
    <T>(run: (c: number, corp: number) => Promise<T>) =>
      async (): Promise<T> => {
        if (characterId === null || corporationId === null) throw new Error('no character');
        try {
          return await run(characterId, corporationId);
        } finally {
          reload();
        }
      },
    [characterId, corporationId, reload]
  );

  const claimAudit = useCallback(
    async (id: number) => {
      if (characterId === null || corporationId === null) return [];
      return readSrpClaimAudit(characterId, corporationId, id);
    },
    [characterId, corporationId]
  );

  return {
    state,
    reload,
    approve: (item) => act((c, corp) => approveSrpClaim(c, corp, item))(),
    approveMany: (items) => act((c, corp) => approveSrpClaims(c, corp, items))(),
    reject: (id, reason) => act((c, corp) => rejectSrpClaim(c, corp, id, reason))(),
    change: (id, amount, reason) =>
      act((c, corp) => changeSrpClaimAmount(c, corp, id, amount, reason))(),
    markPaid: (id) => act((c, corp) => markSrpClaimPaid(c, corp, id))(),
    markPaidMany: (ids) => act((c, corp) => markSrpClaimsPaid(c, corp, ids))(),
    claimAudit,
  };
}
