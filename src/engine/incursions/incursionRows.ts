import { INCURSION_STATES, type IncursionState } from '../../../functions/src/incursionState';

export { INCURSION_STATES, type IncursionState };

export interface IncursionEntry {
  constellation_id: number;
  faction_id: number;
  has_boss: boolean;
  infested_solar_systems: number[];
  influence: number;
  staging_solar_system_id: number;
  state: IncursionState;
  type: string;
}

export interface IncursionRow {
  constellationId: number;
  stagingSystemId: number;
  state: IncursionState;
  influence: number;
  hasBoss: boolean;
  systemCount: number;
  jumps: number | null;
}

const isState = (value: unknown): value is IncursionState =>
  (INCURSION_STATES as readonly unknown[]).includes(value);

export function buildIncursionRows(
  entries: readonly IncursionEntry[],
  jumps: ReadonlyMap<number, number> | null
): IncursionRow[] {
  return entries
    .filter((entry) => isState(entry.state))
    .map((entry) => ({
      constellationId: entry.constellation_id,
      stagingSystemId: entry.staging_solar_system_id,
      state: entry.state,
      influence: Math.min(1, Math.max(0, entry.influence)),
      hasBoss: entry.has_boss,
      systemCount: entry.infested_solar_systems.length,
      jumps: jumps?.get(entry.staging_solar_system_id) ?? null,
    }))
    .sort((a, b) => {
      if (a.jumps !== null && b.jumps !== null && a.jumps !== b.jumps) return a.jumps - b.jumps;
      if ((a.jumps === null) !== (b.jumps === null)) return a.jumps === null ? 1 : -1;
      return b.influence - a.influence || a.constellationId - b.constellationId;
    });
}

export function nearestIncursion(rows: readonly IncursionRow[]): IncursionRow | null {
  const first = rows[0];
  return first !== undefined && first.jumps !== null ? first : null;
}
