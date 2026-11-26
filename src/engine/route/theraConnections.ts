import { HOUR_MS } from '@/lib/age';
import { classifySpace, isWormholeSystemName, SPACE_KINDS, type SpaceKind } from '@/engine/space';

export type TheraHub = 'thera' | 'turnur';
export const THERA_HUBS: readonly TheraHub[] = ['thera', 'turnur'];

export const HUB_SYSTEM_IDS: Readonly<Record<TheraHub, number>> = {
  thera: 31000005,
  turnur: 30002086,
};

export type WormholeShipSize = 'small' | 'medium' | 'large' | 'xlarge' | 'capital';
export const WORMHOLE_SHIP_SIZES: readonly WormholeShipSize[] = [
  'small',
  'medium',
  'large',
  'xlarge',
  'capital',
];

export function shipSizeRank(size: WormholeShipSize): number {
  return WORMHOLE_SHIP_SIZES.indexOf(size);
}

export interface TheraConnection {
  id: string;
  hub: TheraHub;
  hubSignature: string | null;
  exitSignature: string | null;
  exitSystemId: number;
  exitSystemName: string | null;
  exitClass: string | null;
  exitRegionName: string | null;
  wormholeType: string | null;
  maxShipSize: WormholeShipSize | null;
  expiresAt: number;
}

export type ConnectionJumps =
  | { kind: 'known'; jumps: number }
  | { kind: 'no-route' }
  | { kind: 'unknown' }
  | { kind: 'no-origin' };

export type ConnectionDistances =
  | { kind: 'known'; jumps: ReadonlyMap<number, number> }
  | { kind: 'unknown' }
  | { kind: 'no-origin' };

export interface TheraConnectionRow extends TheraConnection {
  exitSecurity: number | null;
  exitSpace: SpaceKind | null;
  remainingMs: number;
  lifeWarning: boolean;
  jumps: ConnectionJumps;
}

export const LIFE_WARNING_MS = 2 * HOUR_MS;

const CLASS_SPACE: Readonly<Record<string, SpaceKind>> = {
  hs: 'highsec',
  ls: 'lowsec',
  ns: 'nullsec',
};

function feedClassSpace(exitClass: string | null): SpaceKind | null {
  if (exitClass === null) return null;
  const known = CLASS_SPACE[exitClass.toLowerCase()];
  if (known) return known;
  return /^c\d+$/i.test(exitClass) ? 'wormhole' : null;
}

function exitSpaceOf(connection: TheraConnection, security: number | null): SpaceKind | null {
  const fromFeed = feedClassSpace(connection.exitClass);
  if (fromFeed === 'wormhole') return 'wormhole';
  const name = connection.exitSystemName ?? '';
  if (isWormholeSystemName(name)) return 'wormhole';
  if (security !== null) return classifySpace(name, security);
  return fromFeed;
}

function jumpsTo(
  connection: TheraConnection,
  space: SpaceKind | null,
  distances: ConnectionDistances
): ConnectionJumps {
  if (space === 'wormhole') return { kind: 'no-route' };
  if (distances.kind !== 'known') return { kind: distances.kind };
  const jumps = distances.jumps.get(connection.exitSystemId);
  return jumps === undefined ? { kind: 'no-route' } : { kind: 'known', jumps };
}

export function buildTheraConnectionRows(
  connections: readonly TheraConnection[],
  context: {
    now: number;
    systems: ReadonlyMap<number, { security: number }>;
    distances: ConnectionDistances;
  }
): TheraConnectionRow[] {
  const rows: TheraConnectionRow[] = [];
  for (const connection of connections) {
    const remainingMs = connection.expiresAt - context.now;
    if (remainingMs <= 0) continue;
    const exitSecurity = context.systems.get(connection.exitSystemId)?.security ?? null;
    const exitSpace = exitSpaceOf(connection, exitSecurity);
    rows.push({
      ...connection,
      exitSecurity,
      exitSpace,
      remainingMs,
      lifeWarning: remainingMs <= LIFE_WARNING_MS,
      jumps: jumpsTo(connection, exitSpace, context.distances),
    });
  }
  return rows;
}

export type TheraExit = 'kspace' | SpaceKind;
export const THERA_EXITS: readonly TheraExit[] = ['kspace', ...SPACE_KINDS];

export interface TheraConnectionFilter {
  hub: TheraHub | 'all';
  shipSize: WormholeShipSize | 'any';
  exit?: TheraExit;
}

function exitMatches(row: TheraConnectionRow, exit: TheraExit | undefined): boolean {
  if (exit === undefined) return true;
  if (exit === 'kspace') return row.exitSpace !== 'wormhole';
  return row.exitSpace === exit;
}

export function filterTheraConnections(
  rows: readonly TheraConnectionRow[],
  filter: TheraConnectionFilter
): TheraConnectionRow[] {
  const minSize = filter.shipSize === 'any' ? -1 : shipSizeRank(filter.shipSize);
  return rows.filter((row) => {
    if (filter.hub !== 'all' && row.hub !== filter.hub) return false;
    if (!exitMatches(row, filter.exit)) return false;
    if (minSize >= 0) {
      if (row.maxShipSize === null) return false;
      if (shipSizeRank(row.maxShipSize) < minSize) return false;
    }
    return true;
  });
}

export function countTheraConnectionsByHub(
  rows: readonly TheraConnectionRow[],
  filter: TheraConnectionFilter
): Record<TheraHub | 'all', number> {
  const counts: Record<TheraHub | 'all', number> = { all: 0, thera: 0, turnur: 0 };
  for (const row of filterTheraConnections(rows, { ...filter, hub: 'all' })) {
    counts.all += 1;
    counts[row.hub] += 1;
  }
  return counts;
}

export function jumpsSortValue(row: TheraConnectionRow): number | undefined {
  return row.jumps.kind === 'known' ? row.jumps.jumps : undefined;
}

export function longestLifeFirst(rows: readonly TheraConnectionRow[]): TheraConnectionRow[] {
  return [...rows].sort(
    (a, b) =>
      b.remainingMs - a.remainingMs ||
      (a.exitSystemName ?? '').localeCompare(b.exitSystemName ?? '')
  );
}

export function canUseInRoute(row: TheraConnectionRow): boolean {
  return row.exitSpace !== 'wormhole' && row.jumps.kind === 'known';
}
