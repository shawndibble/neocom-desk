import { contractCauseOf } from '../walletCause';
import type { FillMatch } from '../market/fillTime';
import type { StationUndercutState } from '../market/stationUndercutState';

/** One of the Character's own open market orders and when it lapses (`ordersLapsing`, issue #3797). */
export interface OrderExpiryEntrySnapshot {
  orderId: number;
  /** `issued` + `duration`, epoch ms, worked out at the ESI boundary so this module stays pure. */
  expiresMs: number;
  /** The Character's `ordersLapsingLeadHours` in ms when this poll ran, baked in for `dueLeadMs`'s reason. */
  leadMs: number;
}

export interface OrderExpirySnapshot {
  entries: readonly OrderExpiryEntrySnapshot[];
  nowMs: number;
}

export interface OrdersLapsingFire {
  eventId: 'ordersLapsing';
  characterId: number;
  /** Orders inside the window when it opened. */
  count: number;
  /** The soonest of them to lapse. */
  soonestMs: number;
  /** The lead time, in ms, that was crossed. */
  thresholdMs: number;
}

/**
 * Orders lapsing within an hour of each other are one batch (a bulk relist
 * issued in one sitting), so they share one alert; orders further apart each
 * get their own once the earlier batch has gone.
 */
export const ORDER_BATCH_WINDOW_MS = 3_600_000;

/** The orders lapsing inside their own lead time at `nowMs`, soonest first. */
function ordersInWindow(snapshot: OrderExpirySnapshot): OrderExpiryEntrySnapshot[] {
  return snapshot.entries
    .filter((e) => e.expiresMs > snapshot.nowMs && e.expiresMs - snapshot.nowMs <= e.leadMs)
    .sort((a, b) => a.expiresMs - b.expiresMs);
}

/** How many of `sorted` (soonest first) belong to the batch that starts at its head. */
export function ordersInBatch(sorted: readonly OrderExpiryEntrySnapshot[]): number {
  if (sorted.length === 0) return 0;
  const limit = sorted[0].expiresMs + ORDER_BATCH_WINDOW_MS;
  return sorted.filter((e) => e.expiresMs <= limit).length;
}

/**
 * One batched fire per batch (issue #3797) — never one per order. It fires
 * when the soonest order inside its lead time starts a batch the previous
 * poll was not already warning about: nothing was inside the window, or the
 * previous soonest has lapsed (or been relisted) and the next one is more
 * than `ORDER_BATCH_WINDOW_MS` later. Orders entering the window behind a
 * batch already warned about stay silent until that batch has gone, then
 * get their own alert, so staggered orders are never left unwarned.
 */
export function diffOrdersLapsing(
  characterId: number,
  prev: OrderExpirySnapshot | undefined,
  next: OrderExpirySnapshot
): OrdersLapsingFire[] {
  if (!prev) return [];
  const inside = ordersInWindow(next);
  if (inside.length === 0) return [];
  const soonestMs = inside[0].expiresMs;
  const before = ordersInWindow(prev);
  if (before.length > 0 && soonestMs - before[0].expiresMs <= ORDER_BATCH_WINDOW_MS) return [];
  return [
    {
      eventId: 'ordersLapsing',
      characterId,
      count: ordersInBatch(inside),
      soonestMs,
      thresholdMs: inside[0].leadMs,
    },
  ];
}

export interface WalletJournalEntrySnapshot {
  id: number;
  amount: number | null;
  /** The Character's current wallet-change threshold, in ISK, as it stood when this poll ran — see `StructureFuelEntrySnapshot`. */
  thresholdIsk: number;
  /**
   * The journal entry's own `date`, in epoch ms. Carried so the fire can be
   * dated by when the ISK moved rather than by the poll that noticed it — a
   * device catching up after days away would otherwise stamp every entry it
   * finds with the moment it looked (`engine/occurrenceKey.occurrenceFiredAt`).
   */
  dateMs: number;
  /**
   * What ESI says moved the ISK (`ref_type`, `context_id`, `context_id_type`),
   * so a line a contract caused can be folded into that contract's alert
   * (`engine/walletCause.ts`). Optional so a baseline persisted before they
   * existed still validates; only entries newer than the baseline ever fire.
   */
  refType?: string;
  contextId?: number;
  contextIdType?: string;
}

export interface WalletSnapshot {
  entries: readonly WalletJournalEntrySnapshot[];
  nowMs: number;
}

export interface WalletNotificationFire {
  eventId: 'walletBalanceChanged';
  characterId: number;
  amount: number | null;
  /** The journal entry this fired for — the fire's Occurrence Key (`engine/occurrenceKey.ts`). */
  journalEntryId: number;
  /** When the ISK moved, epoch ms — the feed row's `firedAt`. */
  dateMs: number;
  /** The journal line's cause, when ESI named one — see `WalletJournalEntrySnapshot`. */
  refType?: string;
  contextId?: number;
  contextIdType?: string;
  /**
   * Set on a contract-caused line under the Character's minimum ISK change. It
   * exists so a contract alert can still count it; on its own it is not worth
   * an alert, so whoever finds it unabsorbed drops it.
   */
  belowThreshold?: true;
}

/**
 * Fires per wallet journal entry id newly above the highest id seen in `prev`
 * (issue #175) — same high-water-mark reasoning as `diffNewMail`: comparing
 * `balance` numbers directly would re-fire on every poll while the balance
 * merely differs from some baseline, whereas journal entry `id` is
 * monotonically increasing, so gating on it fires exactly once per new entry.
 *
 * Also requires the entry's absolute amount to be at or above the
 * Character's chosen threshold (`entry.thresholdIsk`, baked in per entry at
 * `pollDomains/`'s `load()` time — see `StructureFuelEntrySnapshot`), so a
 * threshold change takes effect on the very next poll without special-casing
 * it here: an entry once seen (id `<=` the high-water mark) is never
 * re-evaluated even if the threshold is lowered later, matching
 * `diffCorpWalletThreshold`'s `transactionAbove` half. An entry with a `null`
 * amount can't be compared to a threshold, so it never fires — same
 * treatment `diffCorpWalletThreshold` gives a null-amount journal entry.
 *
 * Sorted oldest-new-entry-first rather than left in ESI's own order (the
 * journal comes back newest-first), so the delivery loop records them in
 * chronological order. Each fire now carries the entry's own `dateMs`, which
 * is what the feed row is dated by, so this ordering no longer decides which
 * row lands on top — it still decides the order the browser toasts are
 * raised in.
 */
export function diffWalletBalanceChanged(
  characterId: number,
  prev: WalletSnapshot | undefined,
  next: WalletSnapshot
): WalletNotificationFire[] {
  if (!prev) return [];
  const maxPrevId = prev.entries.reduce((max, entry) => Math.max(max, entry.id), 0);
  return (
    next.entries
      .filter((entry) => entry.id > maxPrevId)
      .filter((entry) => entry.amount !== null)
      // Under the minimum, a line is kept only when a contract caused it: that
      // alert's total counts every line, and the caller drops what nothing took.
      .filter(
        (entry) =>
          Math.abs(entry.amount ?? 0) >= entry.thresholdIsk || contractCauseOf(entry) !== null
      )
      .sort((a, b) => a.id - b.id)
      .map((entry) => ({
        eventId: 'walletBalanceChanged' as const,
        characterId,
        amount: entry.amount,
        journalEntryId: entry.id,
        dateMs: entry.dateMs,
        ...(Math.abs(entry.amount ?? 0) < entry.thresholdIsk
          ? { belowThreshold: true as const }
          : {}),
        ...(entry.refType !== undefined ? { refType: entry.refType } : {}),
        ...(entry.contextId !== undefined ? { contextId: entry.contextId } : {}),
        ...(entry.contextIdType !== undefined ? { contextIdType: entry.contextIdType } : {}),
      }))
  );
}

export interface MarketOrderEntrySnapshot {
  orderId: number;
  /**
   * Derived at the adapter boundary (ARCHITECTURE.md: callers adapt ESI
   * shapes to engine types): true once an order is gone from the open-orders
   * list and present in order history with `volume_remain === 0` — ESI's
   * history `state` enum ('cancelled' | 'expired') has no distinct "filled"
   * value, so filled-ness isn't a field ESI ever hands back directly.
   */
  filled: boolean;
  /** True for a bid, false for an offer. Only offers are worth telling anyone about — see the diff below. */
  isBuyOrder: boolean;
  /** What was being sold, for the copy. */
  typeId: number;
  /**
   * Units the order was for. Equal to what actually changed hands *because*
   * fill is only recognised at `volume_remain === 0` — a partial fill never
   * reaches here. Anyone adding partial-fill detection has to revisit this.
   */
  quantity: number;
  /**
   * What `engine/market/fillTime` needs to date a fill from the wallet —
   * the station, unit price and `issued` (epoch ms) the order's sales share.
   * Optional so a baseline persisted before they existed still validates.
   */
  locationId?: number;
  price?: number;
  issuedMs?: number;
  /** ESI's `is_corporation`: a corp order's sales pay the corp wallet, which this Character's transactions never show. */
  isCorporation?: boolean;
}

export interface MarketOrderSnapshot {
  entries: readonly MarketOrderEntrySnapshot[];
  nowMs: number;
}

export interface MarketOrderNotificationFire {
  eventId: 'marketOrderFilled';
  characterId: number;
  orderId: number;
  typeId: number;
  quantity: number;
  /**
   * How to find this order's sales in the wallet, so the feed row can be
   * re-dated to the real fill once they show up. Absent for a corp order or
   * an entry whose baseline lacks the details — those keep the poll's time.
   */
  fillMatch?: FillMatch;
}

/** The order's wallet-matching details, when it has all of them and its sales land in this Character's wallet. */
function fillMatchFor(entry: MarketOrderEntrySnapshot): FillMatch | undefined {
  const { locationId, price, issuedMs } = entry;
  if (entry.isCorporation === true) return undefined;
  if (locationId === undefined || price === undefined || issuedMs === undefined) return undefined;
  return { typeId: entry.typeId, locationId, price, issuedMs, quantity: entry.quantity };
}

/**
 * Fires per **sell** order whose `filled` is newly true (issue #175) —
 * edge-triggered on the transition, same shape as `diffContractAccepted`. An
 * order missing from `prev.entries` is treated as not-previously-filled, so
 * one discovered already filled with no prior baseline still fires once.
 *
 * Sell orders only. This reverses GLOSSARY.md round 20, which made one event
 * cover both directions on the grounds that a completed buy and a completed
 * sell are the same thing happening — they are not, to the person being told.
 * A filled sell order is news: someone bought from you while you were doing
 * something else, and there is ISK to collect. A filled buy order is the
 * trade you already set up completing on schedule, and telling you about it
 * buries the one you wanted to hear. See the superseding decision file.
 *
 * Buy orders stay in the snapshot rather than being dropped at derive time so
 * that this rule lives here, next to the tests that pin it, instead of
 * becoming an invisible filter in the polling layer.
 */
export function diffMarketOrderFilled(
  characterId: number,
  prev: MarketOrderSnapshot | undefined,
  next: MarketOrderSnapshot
): MarketOrderNotificationFire[] {
  if (!prev) return [];
  const prevFilledById = new Map(prev.entries.map((entry) => [entry.orderId, entry.filled]));
  const fires: MarketOrderNotificationFire[] = [];
  for (const entry of next.entries) {
    if (!entry.filled || entry.isBuyOrder) continue;
    if (prevFilledById.get(entry.orderId) === true) continue;
    const fillMatch = fillMatchFor(entry);
    fires.push({
      eventId: 'marketOrderFilled',
      characterId,
      orderId: entry.orderId,
      typeId: entry.typeId,
      quantity: entry.quantity,
      ...(fillMatch === undefined ? {} : { fillMatch }),
    });
  }
  return fires;
}

/* -------------------------------------------------------------------------- */
/* Market orders: station undercut/outbid                                     */
/* -------------------------------------------------------------------------- */

export interface OrderUndercutEntrySnapshot {
  orderId: number;
  typeId: number;
  isBuyOrder: boolean;
  locationId: number;
  /** My own order's price — an Occurrence Key input (a relist is a new occurrence) and half of the re-arm rule below. */
  price: number;
  /** This poll's own classification (`engine/market/stationUndercutState.ts`), stored honestly — never frozen. What carries meaning across an `unknown` poll is `armed`, not this field. */
  state: StationUndercutState;
  /** The rival price `state` was read from, or null when `state` is 'unknown'. */
  rivalPrice: number | null;
  /**
   * Whether a future `'beaten'` reading should fire — needed because a plain
   * pairwise `state` comparison can't tell `clear → unknown → beaten` (fire)
   * from `beaten → unknown → beaten` (silent); both read as `prev.state ===
   * 'unknown'`. See `wasArmedBefore` and
   * `docs/context/decisions/20260924-003053-undercut-alerts-classify-the-station-tier-in-the.md`.
   */
  armed: boolean;
}

export interface OrderUndercutSnapshot {
  entries: readonly OrderUndercutEntrySnapshot[];
  nowMs: number;
}

export interface MarketOrderUndercutFire {
  eventId: 'marketOrderUndercut';
  characterId: number;
  orderId: number;
  typeId: number;
  isBuyOrder: boolean;
  price: number;
  /** Always a real price: this fire only ever exists for a `'beaten'` reading, which `classifyStationUndercut` never pairs with a null rival price. */
  rivalPrice: number;
}

/**
 * Whether this order's `'beaten'` reading, if this poll produced one, should
 * actually fire — shared unchanged between `buildOrderUndercutEntry` (which
 * uses it to decide what `armed` to persist through an `unknown` poll) and
 * `diffMarketOrderUndercut` (which uses it to decide whether to fire this
 * poll). The two must agree, or an `unknown` poll's stored `armed` and the
 * diff's own firing decision for the same transition could disagree.
 *
 * A brand-new order already beaten on first sight still fires (owner
 * decision 5) — only a wholly missing `prevSnapshot` is silent, not one order
 * missing from an otherwise-present baseline. A changed price always re-arms
 * (owner decision 4), independent of `state`.
 */
function wasArmedBefore(
  prevSnapshot: OrderUndercutSnapshot | undefined,
  prevEntry: OrderUndercutEntrySnapshot | undefined,
  price: number
): boolean {
  if (!prevSnapshot) return false;
  if (!prevEntry) return true;
  if (prevEntry.price !== price) return true;
  return prevEntry.armed;
}

/**
 * One baseline's orderId lookup, built once and reused across every order in
 * that same poll — `buildOrderUndercutEntry` is called once per order with
 * the same `prevSnapshot` reference, so a plain per-call `.find` would make
 * building a whole snapshot O(n²) in order count.
 */
const prevEntryMaps = new WeakMap<OrderUndercutSnapshot, Map<number, OrderUndercutEntrySnapshot>>();

function prevEntryFor(
  prevSnapshot: OrderUndercutSnapshot,
  orderId: number
): OrderUndercutEntrySnapshot | undefined {
  let map = prevEntryMaps.get(prevSnapshot);
  if (!map) {
    map = new Map(prevSnapshot.entries.map((entry) => [entry.orderId, entry]));
    prevEntryMaps.set(prevSnapshot, map);
  }
  return map.get(orderId);
}

/**
 * Builds one order's stored snapshot entry, folding in the `armed` latch
 * against the previous poll's baseline. Pure and synchronous — the poll
 * domain's `load()` does the async classification (Fuzzwork reads); this is
 * what `pollDomains/`'s `marketOrderUndercutDomain.toSnapshot` calls per
 * entry, and what this module's own sequential tests call directly to prove
 * the three-poll shape without going through the domain at all.
 */
export function buildOrderUndercutEntry(
  order: {
    orderId: number;
    typeId: number;
    isBuyOrder: boolean;
    locationId: number;
    price: number;
    state: StationUndercutState;
    rivalPrice: number | null;
  },
  prevSnapshot: OrderUndercutSnapshot | undefined
): OrderUndercutEntrySnapshot {
  const prevEntry = prevSnapshot ? prevEntryFor(prevSnapshot, order.orderId) : undefined;
  const armedBefore = wasArmedBefore(prevSnapshot, prevEntry, order.price);
  const armed = order.state === 'unknown' ? armedBefore : order.state === 'clear';
  return { ...order, armed };
}

/**
 * Fires once per order newly read `'beaten'` at its own station — undercut
 * for a sell order, outbid for a buy order. See the `armed` latch above for
 * how this stays correct across an `unknown` poll in between (a Fuzzwork
 * outage neither arms nor disarms anything) and across a relist (always
 * re-arms, whatever `state` was doing).
 *
 * `prev === undefined` fires nothing — `wasArmedBefore` already encodes this,
 * but the explicit guard matches every other diff in this module and skips
 * the per-entry work on a poll that could never fire anyway.
 */
export function diffMarketOrderUndercut(
  characterId: number,
  prev: OrderUndercutSnapshot | undefined,
  next: OrderUndercutSnapshot
): MarketOrderUndercutFire[] {
  if (!prev) return [];
  const prevByOrderId = new Map(prev.entries.map((entry) => [entry.orderId, entry]));
  const fires: MarketOrderUndercutFire[] = [];
  for (const entry of next.entries) {
    if (entry.state !== 'beaten' || entry.rivalPrice === null) continue;
    const prevEntry = prevByOrderId.get(entry.orderId);
    if (!wasArmedBefore(prev, prevEntry, entry.price)) continue;
    fires.push({
      eventId: 'marketOrderUndercut',
      characterId,
      orderId: entry.orderId,
      typeId: entry.typeId,
      isBuyOrder: entry.isBuyOrder,
      price: entry.price,
      rivalPrice: entry.rivalPrice,
    });
  }
  return fires;
}

/* -------------------------------------------------------------------------- */
/* Quickbar: price alerts                                                     */
/* -------------------------------------------------------------------------- */

export interface PriceAlertEntrySnapshot {
  typeId: number;
  name: string;
  targetPrice: number;
  direction: 'above' | 'below';
  /** Null when the hub carries no price for this type — never guessed (issue #680 AC4). */
  price: number | null;
}

export interface PriceAlertSnapshot {
  entries: readonly PriceAlertEntrySnapshot[];
  nowMs: number;
}

export interface PriceAlertTriggeredFire {
  eventId: 'priceAlertTriggered';
  characterId: number;
  typeId: number;
  name: string;
  price: number;
  targetPrice: number;
  direction: 'above' | 'below';
}

/** Whether a polled price is at or past its target, in the target's direction. */
export function priceAlertCrossed(entry: PriceAlertEntrySnapshot): boolean {
  if (entry.price === null) return false;
  return entry.direction === 'above'
    ? entry.price >= entry.targetPrice
    : entry.price <= entry.targetPrice;
}

/**
 * Fires per Quickbar item whose hub price has newly crossed its target
 * (issue #680), on `diffStructureFuelLow`'s edge-trigger precedent rather
 * than `diffIndustryJobComplete`'s "newly in the past" shape: a crossing
 * stays true for as long as the price holds there, so an edge-trigger is
 * required or every later poll would re-fire.
 *
 * Re-fire identity is `(typeId, targetPrice, direction)`
 * (`20260909-192510-quickbar-price-alerts-re-arm-key-hub-price.md`), not a
 * separate "already fired" flag: "was it already crossed, and so already
 * reported" is judged against the previous poll's entry for the *same*
 * tuple, so editing the target price or direction — which changes the
 * tuple — is indistinguishable from a genuinely new, unobserved target and
 * fires again on its own crossing rather than staying silent because the
 * old target once fired.
 *
 * An item with no counterpart in `prev` (new to this poll, or a stale
 * target that changed) is treated as not-previously-crossed, so one
 * discovered already past its target still fires once. An item with no hub
 * price (`price: null`) never fires (AC4).
 */
export function diffPriceAlertTriggered(
  characterId: number,
  prev: PriceAlertSnapshot | undefined,
  next: PriceAlertSnapshot
): PriceAlertTriggeredFire[] {
  if (!prev) return [];
  const prevByType = new Map(prev.entries.map((entry) => [entry.typeId, entry]));
  const fires: PriceAlertTriggeredFire[] = [];
  for (const entry of next.entries) {
    if (entry.price === null) continue;
    if (!priceAlertCrossed(entry)) continue;
    const prevEntry = prevByType.get(entry.typeId);
    const sameTarget =
      prevEntry !== undefined &&
      prevEntry.targetPrice === entry.targetPrice &&
      prevEntry.direction === entry.direction;
    if (sameTarget && priceAlertCrossed(prevEntry)) continue;
    fires.push({
      eventId: 'priceAlertTriggered',
      characterId,
      typeId: entry.typeId,
      name: entry.name,
      price: entry.price,
      targetPrice: entry.targetPrice,
      direction: entry.direction,
    });
  }
  return fires;
}
