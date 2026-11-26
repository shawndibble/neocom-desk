export type UndercutScope = 'station' | 'system' | 'region';

export interface MyOrder {
  orderId: number;
  price: number;
  locationId: number;
  systemId: number;
  isBuyOrder: boolean;
}

export interface CompetingOrder {
  orderId: number;
  price: number;
  locationId: number;
  systemId: number;
  volumeRemain: number;
  isBuyOrder: boolean;
  range?: string;
  minVolume?: number;
}

export interface UndercutRival {
  scope: UndercutScope;
  price: number;
  gapIsk: number;
  gapPct: number;
  volumeRemain: number;
  locationId: number;
  systemId: number;
  ordersBeatingMe: number;
  unitsBeatingMe: number;
}

export interface UndercutResult {
  worst: UndercutRival | null;
  byScope: Partial<Record<UndercutScope, UndercutRival | null>>;
}

const ALL_SCOPES: readonly UndercutScope[] = ['station', 'system', 'region'];

const SCOPE_MATCHES: Record<UndercutScope, (mine: MyOrder, c: CompetingOrder) => boolean> = {
  station: (mine, c) => c.locationId === mine.locationId,
  system: (mine, c) => c.systemId === mine.systemId,
  region: () => true,
};

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

export function findUndercut(
  mine: MyOrder,
  competitors: readonly CompetingOrder[],
  scopesChecked: readonly UndercutScope[] = ALL_SCOPES,
  ownOrderIds: ReadonlySet<number> = new Set()
): UndercutResult {
  if (!(mine.price > 0)) return { worst: null, byScope: {} };

  const sameSideRivals = competitors.filter(
    (c) =>
      c.isBuyOrder === mine.isBuyOrder && c.orderId !== mine.orderId && !ownOrderIds.has(c.orderId)
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
