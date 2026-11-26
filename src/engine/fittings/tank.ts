import { ITEM_DOGMA_ATTRIBUTE, type CapacitorStatus, type LocalRepair } from './types';

interface AttributeMap {
  get(attributeId: number): { value: number } | undefined;
}

export interface Magazine {
  cycles: number;
  cycleSeconds: number;
  reloadSeconds: number;
}

export function reloadDuty(magazine: Magazine | undefined): number {
  if (!magazine || magazine.cycles <= 0) return 1;
  const running = magazine.cycles * magazine.cycleSeconds;
  const total = running + magazine.reloadSeconds;
  return total > 0 ? running / total : 1;
}

export function magazineOf(
  read: (id: number) => number,
  cycleAttribute: number = ITEM_DOGMA_ATTRIBUTE.cycleTime
): Magazine {
  const chargeRate = read(ITEM_DOGMA_ATTRIBUTE.chargeRate) || 1;
  return {
    cycles: Math.floor(read(ITEM_DOGMA_ATTRIBUTE.chargeAmount) / chargeRate + 1e-4),
    cycleSeconds: read(cycleAttribute) / 1000,
    reloadSeconds: read(ITEM_DOGMA_ATTRIBUTE.reloadTime) / 1000,
  };
}

export function weaponReloadDuty(attributes: AttributeMap, neverReloads: boolean): number {
  const read = (id: number) => attributes.get(id)?.value ?? 0;
  if (neverReloads || read(ITEM_DOGMA_ATTRIBUTE.chargeRate) <= 0) return 1;
  return reloadDuty(magazineOf(read, ITEM_DOGMA_ATTRIBUTE.rateOfFire));
}

export interface CapacitorUser {
  capPerSecond: number;
  injectionPerCharge?: number;
  magazine?: Magazine;
  ancillary?: Magazine;
}

function isBooster(user: CapacitorUser): boolean {
  return user.capPerSecond < 0 && (user.injectionPerCharge ?? 0) > 0;
}

export function boosterReloadShortfall(users: readonly CapacitorUser[]): number {
  return users
    .filter(isBooster)
    .reduce((sum, user) => sum - user.capPerSecond * (1 - reloadDuty(user.magazine)), 0);
}

export function loadAdjustment(users: readonly CapacitorUser[]): number {
  return users.reduce((sum, user) => {
    if (isBooster(user)) return sum - user.capPerSecond * (1 - reloadDuty(user.magazine));
    if (user.capPerSecond < 0) return sum - user.capPerSecond;
    return sum - user.capPerSecond * (1 - reloadDuty(user.ancillary));
  }, 0);
}

export interface CapacitorBudget {
  peakRecharge: number;
  drain: number;
  boosterInjection: number;
  nosferatuGain: number;
  delta: number;
  deltaPct: number;
  secondsPerBoosterCharge: number | null;
}

export function capacitorBudget(
  users: readonly CapacitorUser[],
  peakRecharge: number
): CapacitorBudget {
  let drain = 0;
  let boosterInjection = 0;
  let nosferatuGain = 0;
  let biggestCharge = 0;
  for (const user of users) {
    if (isBooster(user)) {
      boosterInjection -= user.capPerSecond * reloadDuty(user.magazine);
      biggestCharge = Math.max(biggestCharge, user.injectionPerCharge ?? 0);
    } else if (user.capPerSecond < 0) {
      nosferatuGain -= user.capPerSecond;
    } else {
      drain += user.capPerSecond * reloadDuty(user.ancillary);
    }
  }
  const delta = peakRecharge + boosterInjection - drain;
  const shortWithoutBoosters = drain - peakRecharge;
  return {
    peakRecharge,
    drain,
    boosterInjection,
    nosferatuGain,
    delta,
    deltaPct: peakRecharge > 0 ? (delta / peakRecharge) * 100 : 0,
    secondsPerBoosterCharge:
      biggestCharge > 0 && shortWithoutBoosters > 0 ? biggestCharge / shortWithoutBoosters : null,
  };
}

export type RepairLayer = keyof LocalRepair;

export interface Repairer {
  layer: RepairLayer;
  rate: number;
  capPerSecond: number;
  ancillary?: Magazine;
}

export interface SustainedRepair {
  sustained: LocalRepair;
  capFraction: number;
}

export function sustainedRepair(
  repairers: readonly Repairer[],
  { peakRecharge, peakLoad }: { peakRecharge: number; peakLoad: number }
): SustainedRepair {
  const repairDraw = repairers.reduce(
    (sum, r) => sum + Math.max(0, r.capPerSecond) * reloadDuty(r.ancillary),
    0
  );
  const left = peakRecharge - (peakLoad - repairDraw);
  const capFraction = repairDraw <= 0 ? 1 : Math.min(1, Math.max(0, left / repairDraw));

  const sustained: LocalRepair = { shield: 0, armor: 0, hull: 0 };
  for (const repairer of repairers) {
    let rate = repairer.rate * reloadDuty(repairer.ancillary);
    if (repairer.capPerSecond > 0) rate *= capFraction;
    sustained[repairer.layer] += rate;
  }
  return { sustained, capFraction };
}

export function capacitorStatusAtDrain(
  capacity: number,
  rechargeSeconds: number,
  drain: number
): CapacitorStatus {
  if (drain <= 0 || capacity <= 0 || rechargeSeconds <= 0) {
    return { stable: true, stablePercentage: 100 };
  }
  const load = (drain * rechargeSeconds) / (10 * capacity);
  if (load <= 0.25) {
    const root = (1 + Math.sqrt(Math.max(0, 1 - 4 * load))) / 2;
    return { stable: true, stablePercentage: root * root * 100 };
  }
  const a = Math.sqrt(load - 0.25);
  return {
    stable: false,
    depletesInSeconds: (rechargeSeconds / 10) * (2 / a) * Math.atan(1 / (2 * a)),
  };
}
