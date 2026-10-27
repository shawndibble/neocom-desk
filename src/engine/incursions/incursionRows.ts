/**
 * Route Safety's "Incursions near you" rows (issue #3540): ESI's public
 * `/incursions` feed, each with its jumps from the pilot's Current System,
 * nearest first.
 *
 * Pure: the distances are worked out by the route code with the pilot's own
 * route rules and passed in, so "4 jumps" here is the route Route Safety
 * draws. Conditions, never verdicts — the row states the incursion's state,
 * influence and distance, never whether it is worth running.
 */

export const INCURSION_STATES = ['mobilizing', 'established', 'withdrawing'] as const;
export type IncursionState = (typeof INCURSION_STATES)[number];

/** One entry of ESI `GET /incursions`. */
export interface IncursionEntry {
  constellation_id: number;
  faction_id: number;
  has_boss: boolean;
  infested_solar_systems: number[];
  /** 0 to 1: how far the incursion has pushed the constellation's security down. */
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
  /** Jumps from the Current System to the staging system; null when unknown or unreachable. */
  jumps: number | null;
}

const isState = (value: unknown): value is IncursionState =>
  (INCURSION_STATES as readonly unknown[]).includes(value);

/**
 * Nearest first. A staging system the route cannot reach (or any, when no
 * distances are known) sorts after every known one, highest influence first,
 * rather than reading as 0 jumps.
 */
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

/**
 * The closest incursion, but only when its distance is actually known: rows
 * sort unknown distances last, and "nearest" must never be one of those.
 */
export function nearestIncursion(rows: readonly IncursionRow[]): IncursionRow | null {
  const first = rows[0];
  return first !== undefined && first.jumps !== null ? first : null;
}
