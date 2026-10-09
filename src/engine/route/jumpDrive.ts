/**
 * Jump-drive maths (issue #2862): which systems a hull can jump to, what a
 * jump costs in fuel, and the fatigue and reactivation timer it leaves. Pure,
 * per CLAUDE.md: positions and system rows come in as arguments, nothing here
 * fetches. A hull's own range / fuel type / fuel per ly is `JumpDriveStats`
 * (`engine/fittings/stats.ts`), already skill-adjusted; this module does not
 * re-derive it.
 *
 * Sources
 * - Fatigue and reactivation: CCP's "Phoebe Travel Change Update" dev blog
 *   (2014-10) for the formulas and worked examples, and the EVE University wiki
 *   "Jump drives" page for the present caps. With L the light years just
 *   jumped (after the hull's distance factor) and F the fatigue before the jump:
 *     new fatigue = min(5 h, max(10 x (1 + L) min, F x (1 + L)))
 *     reactivation = min(30 min, max((1 + L) min, F / 10))
 *   Fatigue then decays one-for-one with real time. The caps are the wiki's;
 *   the blog gave fatigue a 30 day ceiling and no cooldown cap, so re-check
 *   them against the client if a plan ever hinges on them.
 * - No skill changes fatigue or the timer. The ticket named Jump Drive
 *   Operation, but the wiki lists it as a capacitor-cost skill; only the hull
 *   does, by shortening the distance counted for fatigue (Black Ops 0.25;
 *   freighters, haulers, DSTs, capsules and the like 0.1). Callers pass that as
 *   `distanceFactor`.
 * - Targets: cynosural fields cannot be lit in high security, and jump drives
 *   cannot target wormhole space (so not Thera). Pochven and Zarzakh are
 *   excluded too; both are from forum / wiki reading rather than a CCP source,
 *   and excluding errs on the safe side. Turnur is an ordinary gated lowsec
 *   system and stays targetable. Cyno jammers and beacons are runtime state the
 *   app cannot know and are out of scope.
 * - Distance: 1 ly = 9.4607e15 m (the figure positions are baked with).
 * - Fuel: the drive burns `fuelPerLightYear` per ly, rounded up to a whole unit.
 */

/** One entry of the baked position file, in light years. */
export interface SystemPosition {
  x: number;
  y: number;
  z: number;
}

/** A system with the fields jump targeting reads: position (ly) plus `systems.json`'s. */
export interface JumpSystem extends SystemPosition {
  id: number;
  security: number;
  regionId: number;
}

export interface JumpTarget {
  id: number;
  distanceLy: number;
}

export const FATIGUE_CAP_MINUTES = 5 * 60;
export const COOLDOWN_CAP_MINUTES = 30;

/** Raw security at or above this shows as 0.5 and is high security. */
const HIGHSEC_MIN_SECURITY = 0.45;
const WORMHOLE_SPACE_MIN_ID = 31000000;
const POCHVEN_REGION_ID = 10000070;
const ZARZAKH_SYSTEM_ID = 30100000;

/**
 * `systemPositions.json` is a flat `[id, x, y, z, id, x, y, z, ...]` array
 * (light years); this reads it into a lookup by system id.
 */
export function indexSystemPositions(flat: readonly number[]): Map<number, SystemPosition> {
  const map = new Map<number, SystemPosition>();
  for (let i = 0; i + 3 < flat.length; i += 4) {
    map.set(flat[i], { x: flat[i + 1], y: flat[i + 2], z: flat[i + 3] });
  }
  return map;
}

export function lightYearDistance(a: SystemPosition, b: SystemPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** True when a jump drive cannot land in the system whatever the beacon situation. */
export function isUntargetable(system: JumpSystem): boolean {
  return (
    system.security >= HIGHSEC_MIN_SECURITY ||
    system.id >= WORMHOLE_SPACE_MIN_ID ||
    system.regionId === POCHVEN_REGION_ID ||
    system.id === ZARZAKH_SYSTEM_ID
  );
}

/** Systems within `rangeLy` of `from` (inclusive) that a drive can target, nearest first. */
export function jumpTargets(
  from: SystemPosition & { id: number },
  rangeLy: number,
  systems: readonly JumpSystem[]
): JumpTarget[] {
  const targets: JumpTarget[] = [];
  for (const system of systems) {
    if (system.id === from.id || isUntargetable(system)) continue;
    const distanceLy = lightYearDistance(from, system);
    if (distanceLy <= rangeLy) targets.push({ id: system.id, distanceLy });
  }
  return targets.sort((a, b) => a.distanceLy - b.distanceLy);
}

/** Fuel one leg burns; `fuelPerLightYear` is `JumpDriveStats`'s skill-adjusted figure. */
export function jumpFuel(distanceLy: number, fuelPerLightYear: number): number {
  // Round away float noise first so 4 ly x 1000 does not become 4001.
  return Math.ceil(Number((distanceLy * fuelPerLightYear).toFixed(6)));
}

export interface JumpFatigueInput {
  /** Fatigue on the pilot when the jump is made, in minutes. */
  fatigueMinutes: number;
  distanceLy: number;
  /** The hull's share of the distance counted for fatigue; 1 for most hulls. */
  distanceFactor?: number;
}

export interface JumpFatigueResult {
  fatigueMinutes: number;
  cooldownMinutes: number;
}

/** Fatigue after the jump and the reactivation timer it starts. */
export function jumpFatigue({
  fatigueMinutes,
  distanceLy,
  distanceFactor = 1,
}: JumpFatigueInput): JumpFatigueResult {
  const growth = 1 + distanceLy * distanceFactor;
  return {
    fatigueMinutes: Math.min(FATIGUE_CAP_MINUTES, Math.max(10 * growth, fatigueMinutes * growth)),
    cooldownMinutes: Math.min(COOLDOWN_CAP_MINUTES, Math.max(growth, fatigueMinutes / 10)),
  };
}

/** Fatigue left after `elapsedMinutes` of real time. */
export function decayFatigue(fatigueMinutes: number, elapsedMinutes: number): number {
  return Math.max(0, fatigueMinutes - elapsedMinutes);
}
