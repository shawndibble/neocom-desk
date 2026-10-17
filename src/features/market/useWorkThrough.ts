/**
 * Open Orders' work-through mode, wired to the network (issue #3991): reads
 * the station's book for the current order, and on Next copies the one-tick
 * price, sends Open in EVE as the order's owner, and moves on. The queue,
 * progress and "Not changed" rules are `workThrough.ts`'s; this hook only
 * holds what the pilot did and talks to ESI.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CompetingOrder } from '@/engine/market/undercut';
import { isNpcStationId } from '@/esi/locationIds';
import { writeToClipboardLater } from '@/lib/clipboard';
import { openInEve } from '@/features/openInEve/sendOpenInEve';
import type { OpenOrderRow } from './openOrdersModel';
import { clearOrderBookCache } from './orderBook';
import { loadRegionCompetition, loadStructureCompetition } from './orderCompetition';
import { priceClipboardText } from './priceClipboardText';
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
 * The order's own station book. `fresh` drops the in-memory 300s copy first,
 * so a Next press re-reads the book rather than reusing the page-load read.
 * A player structure's book comes from the structure itself (the region book
 * never holds structure orders) under the order's owner.
 */
async function readStationBook(
  row: OpenOrderRow,
  fresh: boolean
): Promise<readonly CompetingOrder[] | null> {
  try {
    if (!isNpcStationId(row.locationId)) {
      return (await loadStructureCompetition(row.characterId, row.locationId))?.competitors ?? null;
    }
    if (fresh) clearOrderBookCache(row.regionId, row.typeId);
    return (await loadRegionCompetition(row.regionId, row.typeId)).competitors;
  } catch {
    return null;
  }
}

async function readPrice(
  row: OpenOrderRow,
  ownOrderIds: ReadonlySet<number>,
  fresh: boolean
): Promise<WorkThroughPrice> {
  const book = await readStationBook(row, fresh);
  return book === null ? { kind: 'unavailable' } : clickTimePrice(row, book, ownOrderIds);
}

export interface UseWorkThroughOptions {
  /** Today's queue, re-formed every render (`workThroughQueue`). */
  queue: readonly OpenOrderRow[];
  isPhone: boolean;
  /** Every open order id on every Character — never undercut. */
  ownOrderIds: ReadonlySet<number>;
  /** Whether this owner holds the Open in EVE permission. */
  canOpenInEve: (characterId: number) => boolean;
  /** The latest orders read, for "Not changed". */
  ordersById: ReadonlyMap<number, { price: number; issued: string }>;
  /** When each Character's orders were last fetched (ms). */
  fetchedAtByCharacter: ReadonlyMap<number, number>;
}

export interface WorkThrough {
  running: boolean;
  /** Orders that would be walked if started now. */
  queueCount: number;
  progress: WorkThroughProgress;
  handled: ReadonlyMap<number, HandledOrder>;
  /** Handled orders an orders read after the press shows untouched. */
  notChangedIds: ReadonlySet<number>;
  /** The current order's price as read when it became current; null while loading. */
  preview: WorkThroughPrice | null;
  /** The order a Next press is still working on. */
  pendingId: number | null;
  /** Phone only: the current order was sent to EVE by its own button. */
  currentSent: boolean;
  start: () => void;
  stop: () => void;
  next: () => void;
  skip: () => void;
  /** Phone only: Open in EVE for the current order, without moving on. */
  openCurrent: () => void;
}

export function useWorkThrough({
  queue,
  isPhone,
  ownOrderIds,
  canOpenInEve,
  ordersById,
  fetchedAtByCharacter,
}: UseWorkThroughOptions): WorkThrough {
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<WorkThroughState>(EMPTY_WORK_THROUGH);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ orderId: number; price: WorkThroughPrice } | null>(null);
  const [sentCurrentId, setSentCurrentId] = useState<number | null>(null);

  const progress = useMemo(() => workThroughProgress(queue, state), [queue, state]);
  const current = running ? progress.current : null;
  const currentId = current?.orderId ?? null;

  // The current order's price, read once it becomes current: a phone shows
  // it large before any press, and a below-floor row warns what it loses.
  useEffect(() => {
    if (current === null) return;
    let cancelled = false;
    void readPrice(current, ownOrderIds, false).then((price) => {
      if (!cancelled) setPreview({ orderId: current.orderId, price });
    });
    return () => {
      cancelled = true;
    };
    // Keyed on the order, not the row object: rows are rebuilt as deeper
    // books land, and each rebuild would otherwise re-read the book.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setSentCurrentId(null);
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    setRunning(false);
    setPendingId(null);
  }, []);

  const markHandled = useCallback((handled: HandledOrder) => {
    setState((was) => ({ ...was, handled: new Map(was.handled).set(handled.orderId, handled) }));
  }, []);

  const next = useCallback(() => {
    if (current === null || pendingId !== null) return;
    const row = current;
    const sentAt = Date.now();
    const base = {
      orderId: row.orderId,
      characterId: row.characterId,
      previousPrice: row.price,
      issued: row.issued,
      sentAt,
    };
    if (isPhone) {
      // A phone has nothing to paste into: Next takes the price already
      // shown and moves on. Sent only when its own Open in EVE went out.
      const shown = preview?.orderId === row.orderId ? preview.price : null;
      markHandled({
        ...base,
        newPrice: shown?.kind === 'price' ? shown.price : null,
        copied: false,
        sent: sentCurrentId === row.orderId,
      });
      return;
    }
    setPendingId(row.orderId);
    const price = readPrice(row, ownOrderIds, true);
    // Started inside the click, before any await (`writeToClipboardLater`).
    const copy = writeToClipboardLater(
      price.then((p) => {
        if (p.kind !== 'price') throw new Error('nothing to copy');
        return priceClipboardText(p.price);
      })
    ).then(
      () => true,
      () => false
    );
    void (async () => {
      const read = await price;
      const copied = await copy;
      const sent = canOpenInEve(row.characterId)
        ? (await openInEve(row.characterId, { kind: 'marketDetails', id: row.typeId })).ok
        : false;
      markHandled({
        ...base,
        newPrice: read.kind === 'price' ? read.price : null,
        copied,
        sent,
      });
      setPendingId(null);
    })();
  }, [current, pendingId, isPhone, preview, sentCurrentId, ownOrderIds, canOpenInEve, markHandled]);

  const skip = useCallback(() => {
    if (current === null || pendingId !== null) return;
    setState((was) => ({ ...was, skipped: new Set(was.skipped).add(current.orderId) }));
  }, [current, pendingId]);

  const openCurrent = useCallback(() => {
    if (current === null || !canOpenInEve(current.characterId)) return;
    const orderId = current.orderId;
    void openInEve(current.characterId, { kind: 'marketDetails', id: current.typeId }).then(
      (result) => {
        if (result.ok) setSentCurrentId(orderId);
      }
    );
  }, [current, canOpenInEve]);

  return {
    running,
    queueCount: queue.length,
    progress,
    handled: state.handled,
    notChangedIds,
    preview: preview !== null && preview.orderId === currentId ? preview.price : null,
    pendingId,
    currentSent: currentId !== null && sentCurrentId === currentId,
    start,
    stop,
    next,
    skip,
    openCurrent,
  };
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
