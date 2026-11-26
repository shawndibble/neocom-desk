import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CompetingOrder } from '@/engine/market/undercut';
import { isNpcStationId } from '@/esi/locationIds';
import type { OpenOrderRow } from './openOrdersModel';
import { loadRegionCompetition, loadStructureCompetition } from './orderCompetition';
import { WORK_THROUGH_PARAM } from './openOrdersFilter';
import {
  EMPTY_WORK_THROUGH,
  clickTimePrice,
  isNotChanged,
  workThroughProgress,
  type ClickTimePrice,
  type HandledOrder,
  type WorkThroughProgress,
  type WorkThroughState,
} from './workThrough';

export type WorkThroughPrice = ClickTimePrice | { kind: 'unavailable' };

async function readStationBook(row: OpenOrderRow): Promise<readonly CompetingOrder[] | null> {
  try {
    if (!isNpcStationId(row.locationId)) {
      const book = await loadStructureCompetition(row.characterId, row.locationId);
      return book?.competitors ?? null;
    }
    return (await loadRegionCompetition(row.regionId, row.typeId)).competitors;
  } catch {
    return null;
  }
}

async function readPrice(
  row: OpenOrderRow,
  ownOrderIds: ReadonlySet<number>
): Promise<WorkThroughPrice> {
  const book = await readStationBook(row);
  return book === null ? { kind: 'unavailable' } : clickTimePrice(row, book, ownOrderIds);
}

export interface UseWorkThroughOptions {
  queue: readonly OpenOrderRow[];
  ownOrderIds: ReadonlySet<number>;
  ordersById: ReadonlyMap<number, { price: number; issued: string }>;
  fetchedAtByCharacter: ReadonlyMap<number, number>;
}

export interface WorkThrough {
  running: boolean;
  currentId: number | null;
  queueCount: number;
  progress: WorkThroughProgress;
  handled: ReadonlyMap<number, HandledOrder>;
  notChangedIds: ReadonlySet<number>;
  preview: WorkThroughPrice | null;
  start: () => void;
  stop: () => void;
  next: () => void;
}

export function useWorkThrough({
  queue,
  ownOrderIds,
  ordersById,
  fetchedAtByCharacter,
}: UseWorkThroughOptions): WorkThrough {
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<WorkThroughState>(EMPTY_WORK_THROUGH);
  const [preview, setPreview] = useState<{ orderId: number; price: WorkThroughPrice } | null>(null);

  const progress = useMemo(() => workThroughProgress(queue, state), [queue, state]);
  const current = running ? progress.current : null;
  const currentId = current?.orderId ?? null;

  useEffect(() => {
    if (current === null) return;
    let cancelled = false;
    void readPrice(current, ownOrderIds).then((price) => {
      if (!cancelled) setPreview({ orderId: current.orderId, price });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the order, not the row object: rows are rebuilt as deeper books land, and each rebuild would otherwise re-read the book
  }, [currentId]);

  const notChangedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const handled of state.handled.values()) {
      const fetchedAt = fetchedAtByCharacter.get(handled.characterId) ?? 0;
      if (isNotChanged(handled, ordersById.get(handled.orderId), fetchedAt)) {
        ids.add(handled.orderId);
      }
    }
    return ids;
  }, [state.handled, ordersById, fetchedAtByCharacter]);

  const start = useCallback(() => {
    setState(EMPTY_WORK_THROUGH);
    setPreview(null);
    setRunning(true);
  }, []);

  const stop = useCallback(() => setRunning(false), []);

  const markHandled = useCallback((handled: HandledOrder) => {
    setState((was) => ({ ...was, handled: new Map(was.handled).set(handled.orderId, handled) }));
  }, []);

  const next = useCallback(() => {
    if (current === null) return;
    const shown = preview?.orderId === current.orderId ? preview.price : null;
    markHandled({
      orderId: current.orderId,
      characterId: current.characterId,
      previousPrice: current.price,
      issued: current.issued,
      newPrice: shown?.kind === 'price' ? shown.price : null,
      copied: false,
      sent: false,
      sentAt: Date.now(),
    });
  }, [current, preview, markHandled]);

  return useMemo(
    () => ({
      running,
      currentId,
      queueCount: queue.length,
      progress,
      handled: state.handled,
      notChangedIds,
      preview: preview !== null && preview.orderId === currentId ? preview.price : null,
      start,
      stop,
      next,
    }),
    [
      running,
      currentId,
      queue.length,
      progress,
      state.handled,
      notChangedIds,
      preview,
      start,
      stop,
      next,
    ]
  );
}

export function useWorkThroughStartParam(): boolean {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requested] = useState(() => searchParams.get(WORK_THROUGH_PARAM) === '1');

  useEffect(() => {
    if (!requested) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(WORK_THROUGH_PARAM);
        return params;
      },
      { replace: true }
    );
  }, [requested, setSearchParams]);

  return requested;
}
