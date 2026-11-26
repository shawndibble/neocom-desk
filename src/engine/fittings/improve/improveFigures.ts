import { alignTimeSeconds } from '../stats';
import type { FittingStats } from '../types';

export const reachKm = (s: FittingStats) =>
  Math.max(
    0,
    ...s.applied.weapons.map((w) =>
      w.kind === 'turret' ? w.optimal : w.kind === 'missile' || w.kind === 'area' ? w.range : 0
    )
  ) / 1000;

export const alignOf = (s: FittingStats) =>
  alignTimeSeconds(s.navigation.mass, s.navigation.agility);

export const isResource = (key: string) => /^(cpu|powergrid|calibration)/.test(key);
