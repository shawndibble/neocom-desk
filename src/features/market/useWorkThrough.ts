/**
 * Open Orders' work-through mode, wired to the network: reads the station's
 * book for the current order, which the order's modal shows with its own Copy
 * and Open in EVE. Next records the order as passed (for "Not changed") and
 * moves on. The queue, progress and "Not changed" rules are `workThrough.ts`'s;
 * this hook only holds what the pilot did and talks to ESI.
 */
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

/** The click-time price, or `unavailable` when the book could not be read. */
export type WorkThroughPrice = ClickTimePrice | { kind: 'unavailable' };

/**
 * The order's own station book. A player structure's book comes from the
 * structure itself (the region book never holds structure orders) under the
 * order's owner.
 */
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
  /** Re-formed every render (`workThroughQueue`). */
  queue: readonly OpenOrderRow[];
  /** Every open order id on every Character — never undercut. */
  ownOrderIds: ReadonlySet<number>;
  /** The latest orders read, for "Not changed". */
  ordersById: ReadonlyMap<number, { price: number; issued: string }>;
  /** When each Character's orders were last fetched (ms). */
  fetchedAtByCharacter: ReadonlyMap<number, number>;
}

export interface WorkThrough {
  running: boolean;
  /** The order the walk stands on; null when not running or finished. */
  currentId: number | null;
  /** Orders that would be walked if started now. */
  queueCount: number;
  progress: WorkThroughProgress;
  handled: ReadonlyMap<number, HandledOrder>;
  /** Handled orders an orders read after the press shows untouched. */
  notChangedIds: ReadonlySet<number>;
  /** The current order's price as read when it became current; null while loading. */
  preview: WorkThroughPrice | null;
  start: () => void;
  stop: () => void;
  /** Passes the current order, fixed or not, and moves to the next. */
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

  // The current order's price, read once it becomes current: a phone shows
  // it large before any press, and a below-floor row warns what it loses.
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

  // Memoized: every table row reads this through context.
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

/**
 * Whether the page was opened to start the queue (the Overview Open orders
 * widget's "Work through" link). Latched on mount and spent at once, the way
 * `useHighlightParam` is: a reload never restarts a walk the pilot stopped.
 */
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
