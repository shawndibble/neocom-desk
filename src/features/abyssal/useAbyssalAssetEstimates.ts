/**
 * MutaMarket estimates for the Assets page's abyssal modules: cached answers
 * first, then one bounded queue, rows on screen ahead of the background (rules
 * in scope decision `*-abyssal-estimates-in-asset-totals.md`). Answers land in
 * batches, so the tree rebuilds once per batch. Never imports: Item Detail's ask.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  abyssalItemRefs,
  abyssalItemValues,
  type AbyssalItemRef,
  type OwnedItem,
} from '@/engine/market/abyssalValuation';
import {
  ABYSSAL_UNAVAILABLE_RETRY_MS,
  getAbyssalEstimate,
  onAbyssalEstimate,
  readCachedAbyssalEstimates,
  type AbyssalEstimate,
} from '@/market/mutamarket';
import { useMutaplasmidLookup } from './mutaplasmidData';

/** Modules looked up unasked per scope; rows on screen ask past it. */
export const ABYSSAL_BACKGROUND_LOOKUPS = 100;
const WORKERS = 4;
const BATCH_MS = 300;

export interface AbyssalAssetEstimates {
  /** Null until the mutaplasmid data loads; nothing reads as abyssal until then. */
  isAbyssalType: ((typeId: number) => boolean) | null;
  /** Item id -> ISK, for every abyssal item with a priced estimate. */
  values: ReadonlyMap<number, number>;
  /** Item id -> the latest answer held, any status. */
  estimates: ReadonlyMap<number, AbyssalEstimate>;
  /** Queue one module (a row on screen) ahead of the background; returns the cancel. */
  request: (item: AbyssalItemRef) => () => void;
}

const EMPTY = new Map<number, never>();
const NOOP = () => {};

/** The page's lookups and the batching of their answers; plain state, outside React. */
class LookupQueue {
  private live = true;
  /** Started (in flight or answered): never asked twice. */
  private readonly asked = new Set<number>();
  private rows: AbyssalItemRef[] = [];
  private background: AbyssalItemRef[] = [];
  private backgroundUsed = 0;
  private workers = 0;
  private unavailableUntil = 0;
  private pending = new Map<number, AbyssalEstimate>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private characterIdFor: (itemId: number) => number | null,
    private readonly flush: (batch: Map<number, AbyssalEstimate>) => void
  ) {}

  setCharacterIdFor(characterIdFor: (itemId: number) => number | null): void {
    this.characterIdFor = characterIdFor;
  }

  start(): void {
    this.live = true;
    this.pump();
  }

  stop(): void {
    this.live = false;
    this.rows = [];
    this.background = [];
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  land(itemId: number, estimate: AbyssalEstimate): void {
    if (!this.live) return;
    this.pending.set(itemId, estimate);
    this.flushTimer ??= setTimeout(() => {
      this.flushTimer = null;
      const batch = this.pending;
      this.pending = new Map();
      this.flush(batch);
    }, BATCH_MS);
  }

  resetAllowance(): void {
    this.backgroundUsed = 0;
  }

  /** Replace the background queue with these, within what's left of the allowance. */
  setBackground(items: readonly AbyssalItemRef[]): void {
    this.background = items
      .filter((item) => !this.asked.has(item.itemId))
      .slice(0, Math.max(0, ABYSSAL_BACKGROUND_LOOKUPS - this.backgroundUsed));
    this.pump();
  }

  clearBackground(): void {
    this.background = [];
  }

  request(item: AbyssalItemRef, held: AbyssalEstimate | undefined): () => void {
    const answer = held ?? this.pending.get(item.itemId);
    if (answer && answer.status !== 'unavailable') return NOOP;
    if (this.asked.has(item.itemId) || this.paused()) return NOOP;
    if (this.rows.some((queued) => queued.itemId === item.itemId)) return NOOP;
    this.rows.push(item);
    this.pump();
    return () => {
      this.rows = this.rows.filter((queued) => queued !== item);
    };
  }

  private paused(): boolean {
    return Date.now() < this.unavailableUntil;
  }

  private pump(): void {
    if (!this.live || this.paused()) return;
    while (this.workers < WORKERS && (this.rows.length > 0 || this.background.length > 0)) {
      void this.work();
    }
  }

  private async work(): Promise<void> {
    this.workers += 1;
    try {
      while (this.live && !this.paused()) {
        const fromRow = this.rows.length > 0;
        const item = fromRow ? this.rows.shift() : this.background.shift();
        if (!item) return;
        if (this.asked.has(item.itemId)) continue;
        const characterId = this.characterIdFor(item.itemId);
        if (characterId === null) continue;
        if (!fromRow) this.backgroundUsed += 1;
        this.asked.add(item.itemId);
        const estimate = await getAbyssalEstimate(item.typeId, item.itemId, { characterId });
        this.land(item.itemId, estimate);
        if (estimate.status === 'unavailable') {
          // Every other ask would only fail too: pause, and let this one be asked again.
          this.unavailableUntil = Date.now() + ABYSSAL_UNAVAILABLE_RETRY_MS;
          this.asked.delete(item.itemId);
        }
      }
    } finally {
      this.workers -= 1;
    }
  }
}

export function useAbyssalAssetEstimates(
  assets: readonly OwnedItem[],
  /** The Character whose session reaches MutaMarket for this item. */
  characterIdFor: (itemId: number) => number | null,
  /** The Characters in view: a new scope gets a fresh background allowance. */
  scope: string | number = ''
): AbyssalAssetEstimates {
  const lookup = useMutaplasmidLookup();
  const isAbyssalType = lookup?.isAbyssalType ?? null;
  const [estimates, setEstimates] = useState<ReadonlyMap<number, AbyssalEstimate>>(EMPTY);
  const [queue] = useState(
    () =>
      new LookupQueue(characterIdFor, (batch) =>
        setEstimates((current) => new Map([...current, ...batch]))
      )
  );
  // Set during render, not in an effect: rows' effects (their asks) run before this hook's.
  queue.setCharacterIdFor(characterIdFor);
  const held = useRef(estimates);
  useEffect(() => {
    held.current = estimates;
  });

  useEffect(() => {
    queue.start();
    return () => queue.stop();
  }, [queue]);

  useEffect(() => onAbyssalEstimate((itemId, estimate) => queue.land(itemId, estimate)), [queue]);

  useEffect(() => queue.resetAllowance(), [queue, scope]);

  const abyssalItems = useMemo(
    () => (isAbyssalType ? abyssalItemRefs(assets, isAbyssalType) : []),
    [assets, isAbyssalType]
  );

  useEffect(() => {
    if (abyssalItems.length === 0) return;
    let current = true;
    void (async () => {
      const cached = await readCachedAbyssalEstimates(abyssalItems.map((item) => item.itemId));
      if (!current) return;
      if (cached.size > 0) setEstimates((prior) => new Map([...prior, ...cached]));
      queue.setBackground(abyssalItems.filter((item) => !cached.has(item.itemId)));
    })();
    return () => {
      current = false;
      queue.clearBackground();
    };
  }, [abyssalItems, scope, queue]);

  const values = useMemo(
    () =>
      abyssalItemValues(
        abyssalItems.map((item) => item.itemId),
        estimates
      ),
    [abyssalItems, estimates]
  );

  const request = useCallback(
    (item: AbyssalItemRef) => queue.request(item, held.current.get(item.itemId)),
    [queue]
  );

  return useMemo(
    () => ({ isAbyssalType, values, estimates, request }),
    [isAbyssalType, values, estimates, request]
  );
}
