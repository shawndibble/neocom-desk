/**
 * Grades how badly one of the player's own market orders is beaten by rival
 * orders, across three NESTED scopes: station, system, region. Nesting is the
 * load-bearing idea — a cheaper order at my station is also in my system and
 * my region, so station implies system implies region, and the region's best
 * rival price can never be worse (for me) than the station's. Callers get one
 * severity (`worst` — the tightest scope with a rival) for a row's badge, plus
 * all three (`byScope`) for a detail view that shows the whole picture.
 *
 * "Beats me" is direction-sensitive: a lower price beats a sell order, a
 * higher price beats (outbids) a buy order — same maths, opposite sign. Only
 * orders on my own side are ever compared; the other side is dropped before
 * anything else runs, so a buy order can never register as undercutting a
 * sell order or vice versa.
 *
 * `scopesChecked` exists because station data is cheap and system/region cost
 * an extra ESI fetch. A scope the caller did not ask for is left OUT of
 * `byScope` entirely (absent, not `null`) so the UI can tell "checked, no
 * rival" apart from "not checked yet" — collapsing those two would make a
 * loading state indistinguishable from a genuinely clean order.
 */

export type UndercutScope = 'station' | 'system' | 'region';

/** The player's own order, as the comparison's origin. */
export interface MyOrder {
  orderId: number;
  price: number;
  locationId: number;
  systemId: number;
  isBuyOrder: boolean;
}

/** One competing order from the region order book. */
export interface CompetingOrder {
  orderId: number;
  price: number;
  locationId: number;
  systemId: number;
  volumeRemain: number;
  isBuyOrder: boolean;
}

export interface UndercutRival {
  scope: UndercutScope;
  /** The best (for the rival) price within this scope. */
  price: number;
  /** Absolute ISK difference against my price — always positive. */
  gapIsk: number;
  /** gapIsk as a percentage of MY price. */
  gapPct: number;
  /** Volume remaining on the single best rival order. */
  volumeRemain: number;
  locationId: number;
  systemId: number;
  /** How many competing orders beat mine within this scope. */
  ordersBeatingMe: number;
  /** Sum of volume_remain across those orders. */
  unitsBeatingMe: number;
}

export interface UndercutResult {
  /** The tightest scope with a rival beating me — the row's single badge. Null when nothing beats me. */
  worst: UndercutRival | null;
  /** Every scope that was checked. A scope the caller did not resolve is absent, NOT null. */
  byScope: Partial<Record<UndercutScope, UndercutRival | null>>;
}

const ALL_SCOPES: readonly UndercutScope[] = ['station', 'system', 'region'];

const SCOPE_MATCHES: Record<UndercutScope, (mine: MyOrder, c: CompetingOrder) => boolean> = {
  station: (mine, c) => c.locationId === mine.locationId,
  system: (mine, c) => c.systemId === mine.systemId,
  region: () => true,
};

/** True when `a` beats mine more badly than `b` does, breaking a price tie by
 * larger volumeRemain, then by lower orderId — so the reported rival is
 * stable across refreshes even when several orders share the best price. */
function isWorseRival(mine: MyOrder, a: CompetingOrder, b: CompetingOrder): boolean {
  if (a.price !== b.price) {
    return mine.isBuyOrder ? a.price > b.price : a.price < b.price;
  }
  if (a.volumeRemain !== b.volumeRemain) return a.volumeRemain > b.volumeRemain;
  return a.orderId < b.orderId;
}

function buildRival(
  mine: MyOrder,
  scope: UndercutScope,
  beatingInScope: readonly CompetingOrder[]
): UndercutRival {
  const worstOrder = beatingInScope.reduce((worst, candidate) =>
    isWorseRival(mine, candidate, worst) ? candidate : worst
  );
  const gapIsk = Math.abs(mine.price - worstOrder.price);
  return {
    scope,
    price: worstOrder.price,
    gapIsk,
    gapPct: (gapIsk / mine.price) * 100,
    volumeRemain: worstOrder.volumeRemain,
    locationId: worstOrder.locationId,
    systemId: worstOrder.systemId,
    ordersBeatingMe: beatingInScope.length,
    unitsBeatingMe: beatingInScope.reduce((sum, o) => sum + o.volumeRemain, 0),
  };
}

/**
 * Resolves the worst rival for `mine` within each requested scope, plus the
 * single tightest one. Returns `worst: null` (and an empty `byScope`) for a
 * non-positive `mine.price`, since `gapPct` has no sound value to divide by.
 */
export function findUndercut(
  mine: MyOrder,
  competitors: readonly CompetingOrder[],
  scopesChecked: readonly UndercutScope[] = ALL_SCOPES
): UndercutResult {
  if (!(mine.price > 0)) return { worst: null, byScope: {} };

  const sameSideRivals = competitors.filter(
    (c) => c.isBuyOrder === mine.isBuyOrder && c.orderId !== mine.orderId
  );
  const beating = sameSideRivals.filter((c) =>
    mine.isBuyOrder ? c.price > mine.price : c.price < mine.price
  );

  const byScope: Partial<Record<UndercutScope, UndercutRival | null>> = {};
  for (const scope of scopesChecked) {
    const beatingInScope = beating.filter((c) => SCOPE_MATCHES[scope](mine, c));
    byScope[scope] = beatingInScope.length === 0 ? null : buildRival(mine, scope, beatingInScope);
  }

  const worst = byScope.station ?? byScope.system ?? byScope.region ?? null;

  return { worst, byScope };
}
