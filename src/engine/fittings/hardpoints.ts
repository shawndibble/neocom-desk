/**
 * How many of a hull's turret and launcher hardpoints its high slots take.
 * A module takes one by being fitted (the game's `turretFitted` /
 * `launcherFitted` effects), whatever its state. The hull's totals are ship
 * attributes the stats carry; the engine never subtracts what is fitted.
 */
import type { Fitting } from './types';

/** Which hardpoint a type takes; `undefined` while it isn't known yet. */
export type HardpointKindOf = (typeId: number) => 'turret' | 'launcher' | null | undefined;

export interface HardpointsUsed {
  turrets: number;
  launchers: number;
}

/** Null until every high slot module's kind is known, so it never undercounts. */
export function countHardpoints(fitting: Fitting, kindOf: HardpointKindOf): HardpointsUsed | null {
  const used: HardpointsUsed = { turrets: 0, launchers: 0 };
  for (const module of fitting.modules) {
    if (module.slot !== 'high') continue;
    const kind = kindOf(module.typeId);
    if (kind === undefined) return null;
    if (kind === 'turret') used.turrets += 1;
    else if (kind === 'launcher') used.launchers += 1;
  }
  return used;
}
