import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCharacterIdsWithScopes } from '@/app/characterIdsWithScopes';
import { requiredScopesForEndpoints } from '@/esi/registry';
import { OPEN_IN_EVE_ENDPOINTS } from '@/features/openInEve/sendOpenInEve';
import type { MarketOrder } from '@/esi/endpoints';
import { ownOrderIdSet, type OpenOrderRow } from './openOrdersModel';
import type { OpenOrdersPageSnapshot } from './openOrdersPageSnapshot';
import { workThroughQueue } from './workThrough';
import { useWorkThrough, useWorkThroughStartParam } from './useWorkThrough';
import type { WorkThroughContextValue } from './workThroughContext';

interface UseOpenOrdersWorkThroughOptions {
  sortedRows: readonly OpenOrderRow[];
  /** The unnarrowed snapshot: never undercut an alt. */
  data: OpenOrdersPageSnapshot | null;
  snapshot: OpenOrdersPageSnapshot | null;
  ordersByOrderId: ReadonlyMap<number, MarketOrder>;
  isPhone: boolean;
  rowCount: number;
  onSeeExits: (row: OpenOrderRow) => void;
}

/** The page's work-through: queue, start-from-link, scroll-to-current, and the context it shares. */
export function useOpenOrdersWorkThrough({
  sortedRows,
  data,
  snapshot,
  ordersByOrderId,
  isPhone,
  rowCount,
  onSeeExits,
}: UseOpenOrdersWorkThroughOptions) {
  const workQueue = useMemo(() => workThroughQueue(sortedRows), [sortedRows]);
  const openInEveCharacterIds = useCharacterIdsWithScopes(
    requiredScopesForEndpoints(OPEN_IN_EVE_ENDPOINTS)
  );
  const canOpenInEve = useCallback(
    (characterId: number) => openInEveCharacterIds?.has(characterId) ?? false,
    [openInEveCharacterIds]
  );
  // Every Character's orders, before any narrowing: never undercut an alt.
  const ownOrderIds = useMemo(
    () => (data ? ownOrderIdSet(data.openOrders) : new Set<number>()),
    [data]
  );
  const fetchedAtByCharacter = useMemo(
    () => new Map((snapshot?.openOrders.entries ?? []).map((e) => [e.characterId, e.fetchedAt])),
    [snapshot]
  );
  const workThrough = useWorkThrough({
    queue: workQueue,
    isPhone,
    ownOrderIds,
    canOpenInEve,
    ordersById: ordersByOrderId,
    fetchedAtByCharacter,
  });
  const workCurrentId = workThrough.currentId;
  const workCurrent = workCurrentId === null ? null : workThrough.progress.current;
  const startRequested = useWorkThroughStartParam();
  const startedFromLink = useRef(false);
  const { start: startWorkThrough } = workThrough;
  useEffect(() => {
    if (!startRequested || startedFromLink.current || rowCount === 0) return;
    startedFromLink.current = true;
    startWorkThrough();
  }, [startRequested, rowCount, startWorkThrough]);
  useEffect(() => {
    if (workCurrentId === null) return;
    document
      .querySelector(`[data-row-key="${workCurrentId}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [workCurrentId]);
  const manyOwners = useMemo(
    () => new Set(workQueue.map((row) => row.characterId)).size > 1,
    [workQueue]
  );
  const workThroughContext = useMemo<WorkThroughContextValue>(
    () => ({ workThrough, canOpenInEve, manyOwners, onSeeExits }),
    [workThrough, canOpenInEve, manyOwners, onSeeExits]
  );
  return { workCurrentId, workCurrent, workThroughContext };
}
