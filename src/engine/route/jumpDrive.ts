export interface SystemPosition {
  x: number;
  y: number;
  z: number;
}

export interface JumpSystem extends SystemPosition {
  id: number;
  security: number;
  regionId: number;
}

export const FATIGUE_CAP_MINUTES = 5 * 60;
export const COOLDOWN_CAP_MINUTES = 30;

const HIGHSEC_MIN_SECURITY = 0.45;
const WORMHOLE_SPACE_MIN_ID = 31000000;
const POCHVEN_REGION_ID = 10000070;
const ZARZAKH_SYSTEM_ID = 30100000;

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

export function isUntargetable(system: JumpSystem): boolean {
  return (
    system.security >= HIGHSEC_MIN_SECURITY ||
    system.id >= WORMHOLE_SPACE_MIN_ID ||
    system.regionId === POCHVEN_REGION_ID ||
    system.id === ZARZAKH_SYSTEM_ID
  );
}

export function jumpFuel(distanceLy: number, fuelPerLightYear: number): number {
  return Math.ceil(Number((distanceLy * fuelPerLightYear).toFixed(6)));
}

export interface JumpFatigueInput {
  fatigueMinutes: number;
  distanceLy: number;
  distanceFactor?: number;
}

export interface JumpFatigueResult {
  fatigueMinutes: number;
  cooldownMinutes: number;
}

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

export function decayFatigue(fatigueMinutes: number, elapsedMinutes: number): number {
  return Math.max(0, fatigueMinutes - elapsedMinutes);
}
