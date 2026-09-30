/**
 * Thera / Turnur connections (issue #2330): EVE-Scout's list of the wormholes
 * out of the two public hubs, each joined to its exit system's security and
 * its jump distance from a chosen origin.
 *
 * Pure. The connections come from `lib/eveScout.ts`, the distances from one
 * `localJumpDistances` sweep — never a route request per row.
 *
 * Conditions, never verdicts (decision `20260912-172628`): a row carries the
 * exit's security, remaining life and ship size; nothing ranks a connection.
 */
import { classifySpace, isWormholeSystemName, type SpaceKind } from '@/engine/space';

export type TheraHub = 'thera' | 'turnur';
export const THERA_HUBS: readonly TheraHub[] = ['thera', 'turnur'];

/** Thera is wormhole space with no stargates; Turnur is a gated lowsec system. */
export const HUB_SYSTEM_IDS: Readonly<Record<TheraHub, number>> = {
  thera: 31000005,
  turnur: 30002086,
};

/** EVE-Scout's ship-size vocabulary, smallest first. */
export type WormholeShipSize = 'small' | 'medium' | 'large' | 'xlarge' | 'capital';
export const WORMHOLE_SHIP_SIZES: readonly WormholeShipSize[] = [
  'small',
  'medium',
  'large',
  'xlarge',
  'capital',
];

/** A size's place in `WORMHOLE_SHIP_SIZES` (larger passes more): the one ordering filter and sort share. */
export function shipSizeRank(size: WormholeShipSize): number {
  return WORMHOLE_SHIP_SIZES.indexOf(size);
}

export interface TheraConnection {
  id: string;
  hub: TheraHub;
  /** The signature on the hub side. */
  hubSignature: string | null;
  /** The signature on the exit side. */
  exitSignature: string | null;
  exitSystemId: number;
  exitSystemName: string | null;
  /** EVE-Scout's own class letters: `hs`, `ls`, `ns`, `c1`…`c6`, and the like. */
  exitClass: string | null;
  exitRegionName: string | null;
  wormholeType: string | null;
  maxShipSize: WormholeShipSize | null;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** Jumps from the chosen origin to an exit, or which reason there are none. */
export type ConnectionJumps =
  | { kind: 'known'; jumps: number }
  /** No stargate reaches the exit: wormhole space, or an unconnected system. */
  | { kind: 'no-route' }
  /** The stargate map could not be read. */
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

/** Remaining life at or under this gets the warning styling. */
export const LIFE_WARNING_MS = 2 * 60 * 60 * 1000;

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

/**
 * The exit's band: the repo's own banding on the shown security when the
 * system snapshot knows it (so bands agree with Route Safety), otherwise the
 * feed's class letters.
 */
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
  if (distances.kind !== 'known') return { kind: distances.kind };
  // Wormhole space has no stargates; the local graph must never be asked to
  // route into it (Thera itself included).
  if (space === 'wormhole') return { kind: 'no-route' };
  const jumps = distances.jumps.get(connection.exitSystemId);
  return jumps === undefined ? { kind: 'no-route' } : { kind: 'known', jumps };
}

/** Joins each live connection to its exit's security and distance; collapsed ones are dropped. */
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

export interface TheraConnectionFilter {
  hub: TheraHub | 'all';
  space: SpaceKind | 'all';
  /** Keep connections passing at least this size; `any` keeps every one. */
  shipSize: WormholeShipSize | 'any';
}

export function filterTheraConnections(
  rows: readonly TheraConnectionRow[],
  filter: TheraConnectionFilter
): TheraConnectionRow[] {
  const minSize = filter.shipSize === 'any' ? -1 : shipSizeRank(filter.shipSize);
  return rows.filter((row) => {
    if (filter.hub !== 'all' && row.hub !== filter.hub) return false;
    if (filter.space !== 'all' && row.exitSpace !== filter.space) return false;
    if (minSize >= 0) {
      if (row.maxShipSize === null) return false;
      if (shipSizeRank(row.maxShipSize) < minSize) return false;
    }
    return true;
  });
}

/** The jumps column's sort value: a known distance, else nothing (sorted last). */
export function jumpsSortValue(row: TheraConnectionRow): number | undefined {
  return row.jumps.kind === 'known' ? row.jumps.jumps : undefined;
}
