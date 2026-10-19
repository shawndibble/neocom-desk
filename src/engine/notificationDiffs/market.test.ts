import { describe, it, expect } from 'vitest';
import {
  diffWalletBalanceChanged,
  diffMarketOrderFilled,
  diffPriceAlertTriggered,
  diffMarketOrderUndercut,
  buildOrderUndercutEntry,
  type PriceAlertEntrySnapshot,
  type PriceAlertSnapshot,
  type WalletJournalEntrySnapshot,
  type WalletNotificationFire,
  type WalletSnapshot,
  type MarketOrderEntrySnapshot,
  type MarketOrderSnapshot,
  type OrderUndercutEntrySnapshot,
  type OrderUndercutSnapshot,
} from './index';

const T0 = 1_000_000;
const FIVE_MIN = 5 * 60 * 1000;

function walletEntry(
  id: number,
  amount: number | null = 100,
  thresholdIsk = 0,
  dateMs = T0 + id
): WalletJournalEntrySnapshot {
  return { id, amount, thresholdIsk, dateMs };
}

/** The fire `walletEntry(id, amount)` produces, so the two stay in step. */
function walletFire(id: number, amount: number, dateMs = T0 + id): WalletNotificationFire {
  return { eventId: 'walletBalanceChanged', characterId: 7, amount, journalEntryId: id, dateMs };
}

function walletSnapshot(
  entries: readonly WalletJournalEntrySnapshot[],
  nowMs: number
): WalletSnapshot {
  return { entries, nowMs };
}

describe('diffWalletBalanceChanged', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = walletSnapshot([walletEntry(5)], T0);
    expect(diffWalletBalanceChanged(1, undefined, next)).toEqual([]);
  });

  it('fires when a journal entry id above the previous high-water mark appears', () => {
    const prev = walletSnapshot([walletEntry(5), walletEntry(3)], T0);
    const next = walletSnapshot([walletEntry(6, 250), walletEntry(5), walletEntry(3)], T0 + 2000);
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([walletFire(6, 250)]);
  });

  it('carries what ESI says caused the line, and nothing when it says nothing', () => {
    const prev = walletSnapshot([walletEntry(5)], T0);
    const next = walletSnapshot(
      [
        {
          ...walletEntry(7, 250),
          refType: 'contract_price',
          contextId: 55,
          contextIdType: 'contract_id',
        },
        walletEntry(6, 100),
        walletEntry(5),
      ],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([
      walletFire(6, 100),
      {
        ...walletFire(7, 250),
        refType: 'contract_price',
        contextId: 55,
        contextIdType: 'contract_id',
      },
    ]);
  });

  it('keeps a contract-caused line under the minimum, flagged, and still drops other small lines', () => {
    const prev = walletSnapshot([walletEntry(5)], T0);
    const contractLine = {
      ...walletEntry(7, 40, 1_000),
      refType: 'contract_price',
      contextId: 55,
      contextIdType: 'contract_id',
    };
    const next = walletSnapshot(
      [contractLine, walletEntry(6, 40, 1_000), walletEntry(5)],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([
      {
        ...walletFire(7, 40),
        belowThreshold: true,
        refType: 'contract_price',
        contextId: 55,
        contextIdType: 'contract_id',
      },
    ]);
  });

  it('does not fire for an id already seen', () => {
    const prev = walletSnapshot([walletEntry(5)], T0);
    const next = walletSnapshot([walletEntry(5)], T0 + 2000);
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([]);
  });

  it('does not fire while the balance merely differs from a baseline across many polls with no new entry', () => {
    const prev = walletSnapshot([walletEntry(5)], T0);
    const next = walletSnapshot([walletEntry(5)], T0 + FIVE_MIN * 10);
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([]);
  });

  it('fires once per new journal entry when multiple arrive in the same poll', () => {
    const prev = walletSnapshot([walletEntry(5)], T0);
    const next = walletSnapshot([walletEntry(7), walletEntry(6), walletEntry(5)], T0 + 2000);
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([
      walletFire(6, 100),
      walletFire(7, 100),
    ]);
  });

  it('orders fires oldest-entry-first even though ESI returns the journal newest-first, so the delivery loop records (and the feed shows) the newest one last', () => {
    const prev = walletSnapshot([walletEntry(5)], T0);
    // ESI's own order: id 7 (newest) before id 6 (older) before the
    // already-seen id 5.
    const next = walletSnapshot(
      [walletEntry(7, 700), walletEntry(6, 600), walletEntry(5, 500)],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([
      walletFire(6, 600),
      walletFire(7, 700),
    ]);
  });

  it('does not fire for a new entry whose absolute amount is under the threshold', () => {
    const prev = walletSnapshot([walletEntry(5, 100, 1_000_000)], T0);
    const next = walletSnapshot(
      [walletEntry(6, 999_999, 1_000_000), walletEntry(5, 100, 1_000_000)],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([]);
  });

  it('fires for a new entry whose absolute amount is at or above the threshold', () => {
    const prev = walletSnapshot([walletEntry(5, 100, 1_000_000)], T0);
    const next = walletSnapshot(
      [walletEntry(6, 1_000_000, 1_000_000), walletEntry(5, 100, 1_000_000)],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([walletFire(6, 1_000_000)]);
  });

  it('fires for a large negative (ISK spent) entry once its magnitude crosses the threshold', () => {
    const prev = walletSnapshot([walletEntry(5, 100, 1_000_000)], T0);
    const next = walletSnapshot(
      [walletEntry(6, -2_000_000, 1_000_000), walletEntry(5, 100, 1_000_000)],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([walletFire(6, -2_000_000)]);
  });

  it('does not fire for a new entry with a null amount, since it cannot be compared to the threshold', () => {
    const prev = walletSnapshot([walletEntry(5, 100, 1_000_000)], T0);
    const next = walletSnapshot(
      [walletEntry(6, null, 1_000_000), walletEntry(5, 100, 1_000_000)],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([]);
  });
  it("carries the journal entry's own id and date, so the Occurrence Key and the feed row's time come from the payment rather than the poll", () => {
    const paidAt = T0 - 3 * 86_400_000;
    const prev = walletSnapshot([walletEntry(5)], T0);
    const next = walletSnapshot([walletEntry(6, 250, 0, paidAt), walletEntry(5)], T0 + 2000);
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([walletFire(6, 250, paidAt)]);
  });
});
function orderEntry(
  orderId: number,
  filled: boolean,
  overrides: Partial<MarketOrderEntrySnapshot> = {}
): MarketOrderEntrySnapshot {
  return { orderId, filled, isBuyOrder: false, typeId: 34, quantity: 100, ...overrides };
}

function orderSnapshot(
  entries: readonly MarketOrderEntrySnapshot[],
  nowMs: number
): MarketOrderSnapshot {
  return { entries, nowMs };
}

describe('diffMarketOrderFilled', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = orderSnapshot([orderEntry(1, true)], T0);
    expect(diffMarketOrderFilled(1, undefined, next)).toEqual([]);
  });

  it('fires when a sell order newly transitions to filled, naming the item and how many', () => {
    const prev = orderSnapshot([orderEntry(1, false, { typeId: 34, quantity: 250 })], T0);
    const next = orderSnapshot([orderEntry(1, true, { typeId: 34, quantity: 250 })], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([
      { eventId: 'marketOrderFilled', characterId: 7, orderId: 1, typeId: 34, quantity: 250 },
    ]);
  });

  it('carries what the wallet cross-reference needs to date the fill, for a personal order', () => {
    const details = { locationId: 60003760, price: 5.5, issuedMs: T0 - 86_400_000 };
    const prev = orderSnapshot([orderEntry(1, false, details)], T0);
    const next = orderSnapshot([orderEntry(1, true, details)], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([
      {
        eventId: 'marketOrderFilled',
        characterId: 7,
        orderId: 1,
        typeId: 34,
        quantity: 100,
        fillMatch: {
          typeId: 34,
          locationId: 60003760,
          price: 5.5,
          issuedMs: T0 - 86_400_000,
          quantity: 100,
        },
      },
    ]);
  });

  it('carries no fillMatch for a corp order — its sales pay into the corp wallet, not this one', () => {
    const details = {
      locationId: 60003760,
      price: 5.5,
      issuedMs: T0 - 86_400_000,
      isCorporation: true,
    };
    const prev = orderSnapshot([orderEntry(1, false, details)], T0);
    const next = orderSnapshot([orderEntry(1, true, details)], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next)[0].fillMatch).toBeUndefined();
  });

  it('carries no fillMatch for an entry from a baseline that predates the order details', () => {
    const prev = orderSnapshot([orderEntry(1, false)], T0);
    const next = orderSnapshot([orderEntry(1, true)], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next)[0].fillMatch).toBeUndefined();
  });

  it('stays silent for a filled buy order — nobody bought anything from you', () => {
    const prev = orderSnapshot([orderEntry(2, false, { isBuyOrder: true })], T0);
    const next = orderSnapshot([orderEntry(2, true, { isBuyOrder: true })], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([]);
  });

  it('still fires the sell orders in a batch that also holds a filled buy order', () => {
    const prev = orderSnapshot(
      [orderEntry(1, false), orderEntry(2, false, { isBuyOrder: true })],
      T0
    );
    const next = orderSnapshot(
      [orderEntry(1, true), orderEntry(2, true, { isBuyOrder: true })],
      T0 + 2000
    );
    expect(diffMarketOrderFilled(7, prev, next).map((f) => f.orderId)).toEqual([1]);
  });

  it('does not fire while an order stays unfilled', () => {
    const prev = orderSnapshot([orderEntry(1, false)], T0);
    const next = orderSnapshot([orderEntry(1, false)], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for an order already filled as of the previous poll', () => {
    const prev = orderSnapshot([orderEntry(1, true)], T0);
    const next = orderSnapshot([orderEntry(1, true)], T0 + FIVE_MIN);
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([]);
  });

  it('fires for an order that only appears once already filled (never seen open before)', () => {
    const prev = orderSnapshot([orderEntry(2, false)], T0);
    const next = orderSnapshot([orderEntry(1, true), orderEntry(2, false)], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next).map((f) => f.orderId)).toEqual([1]);
  });
});

/* -------------------------------------------------------------------------- */
/* diffMarketOrderUndercut / buildOrderUndercutEntry (issue #1423)            */
/* -------------------------------------------------------------------------- */

function undercutEntry(
  orderId: number,
  price: number,
  state: OrderUndercutEntrySnapshot['state'],
  rivalPrice: number | null,
  overrides: Partial<Pick<OrderUndercutEntrySnapshot, 'typeId' | 'isBuyOrder' | 'locationId'>> = {}
): Omit<OrderUndercutEntrySnapshot, 'armed'> {
  return {
    orderId,
    typeId: 34,
    isBuyOrder: false,
    locationId: 60003760,
    price,
    state,
    rivalPrice,
    ...overrides,
  };
}

/**
 * One poll's stored snapshot, built the same way `pollDomains/`'s
 * `marketOrderUndercutDomain.toSnapshot` builds it — every entry threaded
 * through `buildOrderUndercutEntry` against the PREVIOUS poll's own stored
 * snapshot. Chaining this across several calls (poll1 -> poll2, then poll2's
 * own output as the input to poll3) is what proves the sequential shape:
 * feeding hand-authored `armed` values in would prove nothing about whether
 * the domain's own persistence actually carries them forward correctly.
 */
function undercutPoll(
  raws: readonly Omit<OrderUndercutEntrySnapshot, 'armed'>[],
  prev: OrderUndercutSnapshot | undefined,
  nowMs: number
): OrderUndercutSnapshot {
  return { entries: raws.map((raw) => buildOrderUndercutEntry(raw, prev)), nowMs };
}

describe('buildOrderUndercutEntry', () => {
  it('stores armed: true for a clear reading, so a later beaten fires', () => {
    expect(buildOrderUndercutEntry(undercutEntry(1, 100, 'clear', 105), undefined).armed).toBe(
      true
    );
  });

  it('stores armed: false for a beaten reading, so a later beaten alone does not re-fire', () => {
    expect(buildOrderUndercutEntry(undercutEntry(1, 100, 'beaten', 95), undefined).armed).toBe(
      false
    );
  });

  it('freezes armed at whatever it was before, for an unknown reading', () => {
    const wasClear: OrderUndercutSnapshot = {
      entries: [{ ...undercutEntry(1, 100, 'clear', 105), armed: true }],
      nowMs: T0,
    };
    expect(buildOrderUndercutEntry(undercutEntry(1, 100, 'unknown', null), wasClear).armed).toBe(
      true
    );

    const wasBeaten: OrderUndercutSnapshot = {
      entries: [{ ...undercutEntry(1, 100, 'beaten', 95), armed: false }],
      nowMs: T0,
    };
    expect(buildOrderUndercutEntry(undercutEntry(1, 100, 'unknown', null), wasBeaten).armed).toBe(
      false
    );
  });

  it('treats a brand-new order (missing from the baseline) as armed, even from an unknown first reading', () => {
    const prev: OrderUndercutSnapshot = { entries: [], nowMs: T0 };
    expect(buildOrderUndercutEntry(undercutEntry(1, 100, 'unknown', null), prev).armed).toBe(true);
  });

  it('never arms on the very first poll for a character, even from an unknown reading', () => {
    expect(buildOrderUndercutEntry(undercutEntry(1, 100, 'unknown', null), undefined).armed).toBe(
      false
    );
  });

  it('re-arms on a relist (own price changed), regardless of the previous armed value', () => {
    const wasBeatenAndDisarmed: OrderUndercutSnapshot = {
      entries: [{ ...undercutEntry(1, 100, 'beaten', 95), armed: false }],
      nowMs: T0,
    };
    // Relisted at a new price (90), and still unknown this poll — the price
    // change alone re-arms it, independent of the frozen-armed rule above.
    expect(
      buildOrderUndercutEntry(undercutEntry(1, 90, 'unknown', null), wasBeatenAndDisarmed).armed
    ).toBe(true);
  });
});

describe('diffMarketOrderUndercut', () => {
  it('fires nothing on the first-ever poll, whatever state it observes', () => {
    const next = undercutPoll([undercutEntry(1, 100, 'beaten', 99)], undefined, T0);
    expect(diffMarketOrderUndercut(7, undefined, next)).toEqual([]);
  });

  it('fires once when an order goes from clear to beaten (undercut)', () => {
    const prev = undercutPoll([undercutEntry(1, 100, 'clear', 105)], undefined, T0);
    const next = undercutPoll([undercutEntry(1, 100, 'beaten', 95)], prev, T0 + FIVE_MIN);
    expect(diffMarketOrderUndercut(7, prev, next)).toEqual([
      {
        eventId: 'marketOrderUndercut',
        characterId: 7,
        orderId: 1,
        typeId: 34,
        isBuyOrder: false,
        price: 100,
        rivalPrice: 95,
      },
    ]);
  });

  it('stays silent while an order remains beaten across polls', () => {
    const poll1 = undercutPoll([undercutEntry(1, 100, 'clear', 105)], undefined, T0);
    const poll2 = undercutPoll([undercutEntry(1, 100, 'beaten', 95)], poll1, T0 + FIVE_MIN);
    expect(diffMarketOrderUndercut(7, poll1, poll2)).toHaveLength(1);
    const poll3 = undercutPoll([undercutEntry(1, 100, 'beaten', 90)], poll2, T0 + 2 * FIVE_MIN);
    expect(diffMarketOrderUndercut(7, poll2, poll3)).toEqual([]);
  });

  it('fires twice in total across beaten -> clear -> beaten', () => {
    const poll1 = undercutPoll([undercutEntry(1, 100, 'clear', 105)], undefined, T0);
    const poll2 = undercutPoll([undercutEntry(1, 100, 'beaten', 95)], poll1, T0 + FIVE_MIN);
    const poll3 = undercutPoll([undercutEntry(1, 100, 'clear', 105)], poll2, T0 + 2 * FIVE_MIN);
    const poll4 = undercutPoll([undercutEntry(1, 100, 'beaten', 95)], poll3, T0 + 3 * FIVE_MIN);
    expect(diffMarketOrderUndercut(7, poll1, poll2)).toHaveLength(1);
    expect(diffMarketOrderUndercut(7, poll2, poll3)).toEqual([]); // going clear is not itself a fire
    expect(diffMarketOrderUndercut(7, poll3, poll4)).toHaveLength(1);
  });

  // The correctness trap (issue #1423): a diff comparing only two adjacent
  // snapshots cannot tell `clear -> unknown -> beaten` apart from
  // `beaten -> unknown -> beaten` — both look like `prev.state === 'unknown'`
  // pairwise. These two sequential tests feed THREE real polls through
  // `undercutPoll`'s own chaining (poll2's OWN built output becomes the input
  // to poll3), which is what actually exercises the stored `armed` latch
  // rather than a hand-authored one.
  it('sequential: clear -> unknown -> beaten fires — an outage never swallows a real undercut', () => {
    const poll1 = undercutPoll([undercutEntry(1, 100, 'clear', 105)], undefined, T0);
    const poll2 = undercutPoll([undercutEntry(1, 100, 'unknown', null)], poll1, T0 + FIVE_MIN);
    expect(diffMarketOrderUndercut(7, poll1, poll2)).toEqual([]);
    const poll3 = undercutPoll([undercutEntry(1, 100, 'beaten', 95)], poll2, T0 + 2 * FIVE_MIN);
    expect(diffMarketOrderUndercut(7, poll2, poll3)).toEqual([
      {
        eventId: 'marketOrderUndercut',
        characterId: 7,
        orderId: 1,
        typeId: 34,
        isBuyOrder: false,
        price: 100,
        rivalPrice: 95,
      },
    ]);
  });

  it('sequential: beaten -> unknown -> beaten stays silent — an outage never resets the latch', () => {
    const poll1 = undercutPoll([undercutEntry(1, 100, 'clear', 105)], undefined, T0);
    const poll2 = undercutPoll([undercutEntry(1, 100, 'beaten', 95)], poll1, T0 + FIVE_MIN);
    expect(diffMarketOrderUndercut(7, poll1, poll2)).toHaveLength(1);
    const poll3 = undercutPoll([undercutEntry(1, 100, 'unknown', null)], poll2, T0 + 2 * FIVE_MIN);
    expect(diffMarketOrderUndercut(7, poll2, poll3)).toEqual([]);
    const poll4 = undercutPoll([undercutEntry(1, 100, 'beaten', 90)], poll3, T0 + 3 * FIVE_MIN);
    expect(diffMarketOrderUndercut(7, poll3, poll4)).toEqual([]);
  });

  it('a brand-new order already beaten on its first sighting fires, even though a baseline exists for the character (owner decision 5)', () => {
    const prev = undercutPoll([undercutEntry(2, 50, 'clear', 55)], undefined, T0);
    const next = undercutPoll(
      [undercutEntry(2, 50, 'clear', 55), undercutEntry(1, 100, 'beaten', 95)],
      prev,
      T0 + FIVE_MIN
    );
    expect(diffMarketOrderUndercut(7, prev, next).map((f) => f.orderId)).toEqual([1]);
  });

  it('a closed order simply drops out of the snapshot — no fire, no crash', () => {
    const prev = undercutPoll([undercutEntry(1, 100, 'beaten', 95)], undefined, T0);
    const next = undercutPoll([], prev, T0 + FIVE_MIN);
    expect(diffMarketOrderUndercut(7, prev, next)).toEqual([]);
  });

  it('fires for a beaten buy order (outbid) alongside a beaten sell order (undercut) in the same poll', () => {
    const prev = undercutPoll(
      [
        undercutEntry(1, 100, 'clear', 105),
        undercutEntry(2, 50, 'clear', 45, { isBuyOrder: true }),
      ],
      undefined,
      T0
    );
    const next = undercutPoll(
      [
        undercutEntry(1, 100, 'beaten', 95),
        undercutEntry(2, 50, 'beaten', 55, { isBuyOrder: true }),
      ],
      prev,
      T0 + FIVE_MIN
    );
    expect(diffMarketOrderUndercut(7, prev, next).map((f) => [f.orderId, f.isBuyOrder])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  // Not in the brief's own case list, but required by the acceptance
  // criteria ("after a relist at a new price, a new beating alerts again") —
  // `state` never leaves 'beaten' here, so a diff that only watched `state`
  // transitions would wrongly stay silent.
  it('a relist at a new price re-arms and fires again, even though it never left beaten', () => {
    const poll1 = undercutPoll([undercutEntry(1, 100, 'clear', 105)], undefined, T0);
    const poll2 = undercutPoll([undercutEntry(1, 100, 'beaten', 95)], poll1, T0 + FIVE_MIN);
    expect(diffMarketOrderUndercut(7, poll1, poll2)).toHaveLength(1);
    const poll3 = undercutPoll([undercutEntry(1, 90, 'beaten', 85)], poll2, T0 + 2 * FIVE_MIN);
    expect(diffMarketOrderUndercut(7, poll2, poll3)).toEqual([
      {
        eventId: 'marketOrderUndercut',
        characterId: 7,
        orderId: 1,
        typeId: 34,
        isBuyOrder: false,
        price: 90,
        rivalPrice: 85,
      },
    ]);
  });
});

function priceAlertEntry(
  overrides: Partial<PriceAlertEntrySnapshot> & Pick<PriceAlertEntrySnapshot, 'typeId'>
): PriceAlertEntrySnapshot {
  return {
    name: 'Tritanium',
    targetPrice: 5,
    direction: 'above',
    price: null,
    ...overrides,
  };
}

function priceAlertSnapshot(
  entries: readonly PriceAlertEntrySnapshot[],
  nowMs: number
): PriceAlertSnapshot {
  return { entries, nowMs };
}

describe('diffPriceAlertTriggered', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = priceAlertSnapshot([priceAlertEntry({ typeId: 34, price: 10 })], T0);
    expect(diffPriceAlertTriggered(1, undefined, next)).toEqual([]);
  });

  it('fires when the price newly crosses at/above the target', () => {
    const prev = priceAlertSnapshot([priceAlertEntry({ typeId: 34, price: 4 })], T0);
    const next = priceAlertSnapshot([priceAlertEntry({ typeId: 34, price: 6 })], T0 + FIVE_MIN);
    expect(diffPriceAlertTriggered(7, prev, next)).toEqual([
      {
        eventId: 'priceAlertTriggered',
        characterId: 7,
        typeId: 34,
        name: 'Tritanium',
        price: 6,
        targetPrice: 5,
        direction: 'above',
      },
    ]);
  });

  it('fires when the price newly crosses at/below the target', () => {
    const prev = priceAlertSnapshot(
      [priceAlertEntry({ typeId: 34, direction: 'below', targetPrice: 5, price: 6 })],
      T0
    );
    const next = priceAlertSnapshot(
      [priceAlertEntry({ typeId: 34, direction: 'below', targetPrice: 5, price: 4 })],
      T0 + FIVE_MIN
    );
    expect(diffPriceAlertTriggered(7, prev, next)).toEqual([
      {
        eventId: 'priceAlertTriggered',
        characterId: 7,
        typeId: 34,
        name: 'Tritanium',
        price: 4,
        targetPrice: 5,
        direction: 'below',
      },
    ]);
  });

  it('does not fire while the price has not yet crossed the target', () => {
    const prev = priceAlertSnapshot([priceAlertEntry({ typeId: 34, price: 3 })], T0);
    const next = priceAlertSnapshot([priceAlertEntry({ typeId: 34, price: 4 })], T0 + FIVE_MIN);
    expect(diffPriceAlertTriggered(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for a target already crossed as of the previous poll', () => {
    const prev = priceAlertSnapshot([priceAlertEntry({ typeId: 34, price: 6 })], T0);
    const next = priceAlertSnapshot([priceAlertEntry({ typeId: 34, price: 7 })], T0 + FIVE_MIN);
    expect(diffPriceAlertTriggered(7, prev, next)).toEqual([]);
  });

  it('fires for a target discovered already crossed (new to this poll)', () => {
    const prev = priceAlertSnapshot([], T0);
    const next = priceAlertSnapshot([priceAlertEntry({ typeId: 34, price: 6 })], T0 + FIVE_MIN);
    expect(diffPriceAlertTriggered(7, prev, next)).toEqual([
      expect.objectContaining({ typeId: 34, price: 6 }),
    ]);
  });

  it('skips an item with no hub price rather than firing a false alert (AC4)', () => {
    const prev = priceAlertSnapshot([priceAlertEntry({ typeId: 34, price: null })], T0);
    const next = priceAlertSnapshot([priceAlertEntry({ typeId: 34, price: null })], T0 + FIVE_MIN);
    expect(diffPriceAlertTriggered(7, prev, next)).toEqual([]);
  });

  it('re-fires when the target price is edited, even though the old target already fired (AC: editing stops the old target, not the item)', () => {
    const prev = priceAlertSnapshot(
      [priceAlertEntry({ typeId: 34, targetPrice: 5, price: 6 })],
      T0
    );
    const next = priceAlertSnapshot(
      [priceAlertEntry({ typeId: 34, targetPrice: 10, price: 12 })],
      T0 + FIVE_MIN
    );
    expect(diffPriceAlertTriggered(7, prev, next)).toEqual([
      expect.objectContaining({ typeId: 34, targetPrice: 10, price: 12 }),
    ]);
  });

  it('re-fires when the direction is edited, even though the old direction already fired', () => {
    const prev = priceAlertSnapshot(
      [priceAlertEntry({ typeId: 34, direction: 'above', targetPrice: 5, price: 6 })],
      T0
    );
    const next = priceAlertSnapshot(
      [priceAlertEntry({ typeId: 34, direction: 'below', targetPrice: 5, price: 4 })],
      T0 + FIVE_MIN
    );
    expect(diffPriceAlertTriggered(7, prev, next)).toEqual([
      expect.objectContaining({ typeId: 34, direction: 'below' }),
    ]);
  });
});
