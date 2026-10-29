/**
 * Single figures Improve's rows read off a fit's stats. Pure.
 */
import { alignTimeSeconds } from './stats';
import type { FittingStats } from './types';

/** The furthest a turret's optimal, a missile's or area weapon's range reaches, in km. */
export const reachKm = (s: FittingStats) =>
  Math.max(
    0,
    ...s.applied.weapons.map((w) =>
      w.kind === 'turret' ? w.optimal : w.kind === 'missile' || w.kind === 'area' ? w.range : 0
    )
  ) / 1000;

export const alignOf = (s: FittingStats) =>
  alignTimeSeconds(s.navigation.mass, s.navigation.agility);

/** Whether a stat-change key is one of the fit's resources (CPU, powergrid, calibration). */
export const isResource = (key: string) => /^(cpu|powergrid|calibration)/.test(key);
