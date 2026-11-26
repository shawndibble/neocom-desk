import type { RouteSafetyTripRow } from './routeSafetyTrip';

export const ANSIBLEX_MAX_JUMP_MASS_KG = 1_480_000_000;

export type HoleMassTable = Readonly<Record<string, readonly [number, number]>>;

export type MassVerdict = { kind: 'ok' } | { kind: 'too-heavy'; limitKg: number; shipKg: number };

const OK: MassVerdict = { kind: 'ok' };

function verdictFor(limitKg: number, shipKg: number): MassVerdict {
  return shipKg > limitKg ? { kind: 'too-heavy', limitKg, shipKg } : OK;
}

export function holeMassVerdict(
  wormholeType: string | null,
  shipKg: number,
  table: HoleMassTable
): MassVerdict {
  const limits = wormholeType === null ? undefined : table[wormholeType];
  return limits ? verdictFor(limits[0], shipKg) : OK;
}

export function bridgeMassVerdict(shipKg: number): MassVerdict {
  return verdictFor(ANSIBLEX_MAX_JUMP_MASS_KG, shipKg);
}

export function routeMassCheck(
  rows: readonly Pick<RouteSafetyTripRow, 'entry'>[],
  shipKg: number | null,
  table: HoleMassTable
): { blocked: number; bridgeBlocked: number } {
  let blocked = 0;
  let bridgeBlocked = 0;
  if (shipKg === null) return { blocked, bridgeBlocked };
  for (const { entry } of rows) {
    if (entry?.kind === 'hole') {
      if (holeMassVerdict(entry.hole.wormholeType, shipKg, table).kind !== 'ok') blocked += 1;
    } else if (entry?.kind === 'bridge' && bridgeMassVerdict(shipKg).kind !== 'ok') {
      bridgeBlocked += 1;
    }
  }
  return { blocked, bridgeBlocked };
}
