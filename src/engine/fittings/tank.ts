/**
 * Capacitor budget and sustained local tank — this app's own arithmetic on
 * top of the engine's per-module figures (ADR 0016: anything beyond what the
 * engine computes is our addition, and labelled as such). Pure.
 *
 * The engine already reports, per module, the capacitor it draws at full
 * speed (`capacitorPeakLoad`, GJ/s — negative for a cap booster's injection
 * and a nosferatu's take) and its repair rate at full speed (burst). What it
 * does not say is how much of that burst the capacitor can keep feeding, or
 * what an ancillary repairer averages once its reload is counted. That is
 * this module:
 *
 * - **Sustained** repair holds burst while the capacitor's peak recharge
 *   (plus boosters and nosferatu, as the engine counts them) covers every
 *   running module. When it doesn't, the modules that aren't repairers are
 *   fed first, and the capacitor-using repairers all run at the share of
 *   their draw that is left — Pyfa's "sustainable" tank takes the same view.
 * - A loaded **ancillary** repairer (charges instead of, or on top of,
 *   capacitor) runs its whole magazine and then stops for the reload, so it
 *   averages its burst over `cycles × cycle + reload`.
 * - A **cap booster** does the same: its injection is averaged over its
 *   magazine and reload (`reloadDuty`, the one rule for both). The engine's
 *   own peak load counts it at its charge-per-cycle rate with no reload, so
 *   `boosterReloadShortfall` is what the sustained tank adds back to it.
 */
import type { CapacitorStatus, LocalRepair } from './types';

/** A module's charges: how many whole cycles one load runs, and the reload after. */
export interface Magazine {
  cycles: number;
  cycleSeconds: number;
  reloadSeconds: number;
}

/**
 * The share (0–1] of a long fight a module with this magazine spends
 * running rather than reloading; 1 with none, or one too small for a whole
 * cycle (which never reloads into anything).
 */
export function reloadDuty(magazine: Magazine | undefined): number {
  if (!magazine || magazine.cycles <= 0) return 1;
  const running = magazine.cycles * magazine.cycleSeconds;
  const total = running + magazine.reloadSeconds;
  return total > 0 ? running / total : 1;
}

/** One running module's capacitor use, as the engine reports it. */
export interface CapacitorUser {
  /** GJ/s at full speed; negative for what a cap booster or a nosferatu adds. */
  capPerSecond: number;
  /**
   * GJ the loaded charge injects. Only a cap booster's shows in its draw — an
   * ancillary shield booster loads the same charges and just runs free on them.
   */
  injectionPerCharge?: number;
  /** A cap booster's charges and reload, which its injection is averaged over. */
  magazine?: Magazine;
}

/** A cap booster: it injects (a negative draw) from a loaded charge. */
function isBooster(user: CapacitorUser): boolean {
  return user.capPerSecond < 0 && (user.injectionPerCharge ?? 0) > 0;
}

/**
 * GJ/s the cap boosters lose to their reloads against the no-reload rate
 * the engine nets into its own peak load — what to add back to that load.
 */
export function boosterReloadShortfall(users: readonly CapacitorUser[]): number {
  return users
    .filter(isBooster)
    .reduce((sum, user) => sum - user.capPerSecond * (1 - reloadDuty(user.magazine)), 0);
}

export interface CapacitorBudget {
  /** GJ/s the capacitor refills at its fastest (25% full). */
  peakRecharge: number;
  /** GJ/s every running module draws. */
  drain: number;
  /** GJ/s cap boosters inject, one charge a cycle, averaged over their reloads. */
  boosterInjection: number;
  /** GJ/s nosferatu take from their targets. */
  nosferatuGain: number;
  /** Peak recharge + injection + nosferatu − drain; below 0 the capacitor runs down. */
  delta: number;
  /** `delta` as a share of peak recharge, percent. */
  deltaPct: number;
  /**
   * How often, on average, a cap booster must inject its biggest loaded
   * charge to hold the capacitor at peak — an average over a long fight, so
   * reloads don't change it — null when recharge alone keeps up, or no
   * booster is fitted to do it.
   */
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
      // The engine nets a cap booster's injection into its own draw, at its
      // full rate; a long fight also waits out its reloads.
      boosterInjection -= user.capPerSecond * reloadDuty(user.magazine);
      biggestCharge = Math.max(biggestCharge, user.injectionPerCharge ?? 0);
    } else if (user.capPerSecond < 0) {
      nosferatuGain -= user.capPerSecond;
    } else {
      drain += user.capPerSecond;
    }
  }
  const delta = peakRecharge + boosterInjection + nosferatuGain - drain;
  const shortWithoutBoosters = drain - nosferatuGain - peakRecharge;
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

/** One running local repairer. */
export interface Repairer {
  layer: RepairLayer;
  /** HP/s at full speed (burst), as the engine reports it. */
  rate: number;
  /** GJ/s it draws; 0 for an ancillary shield booster running on its charges. */
  capPerSecond: number;
  /** Loaded with charges it runs out of: how many whole cycles, and the reload after. */
  ancillary?: Magazine;
}

export interface SustainedRepair {
  /** HP/s each layer's repairers average, capacitor and reloads counted. */
  sustained: LocalRepair;
  /** The share (0–1) of the capacitor-using repairers' draw the capacitor can feed. */
  capFraction: number;
}

/**
 * Sustained local repair. `peakLoad` is the engine's own total (every
 * running module, the repairers included, boosters and nosferatu netted off).
 */
export function sustainedRepair(
  repairers: readonly Repairer[],
  { peakRecharge, peakLoad }: { peakRecharge: number; peakLoad: number }
): SustainedRepair {
  const repairDraw = repairers.reduce((sum, r) => sum + Math.max(0, r.capPerSecond), 0);
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

/**
 * Stable level, or time to empty, of a capacitor under a steady net drain
 * (GJ/s — draw less nosferatu and reload-averaged cap booster injection),
 * on the game's recharge curve: dC/dt = 10·C/τ·(√s − s) − drain, s the
 * fraction full, which peaks at 2.5·C/τ at 25%. Closed form, not the
 * engine's per-cycle simulation: once cap boosters are averaged over their
 * reloads the drain is an average, and so is this — but it agrees with the
 * capacitor Delta by construction (stable exactly when the drain is at most
 * peak recharge). For a fit whose injection the engine counts with no reload.
 *
 * - Stable: 10/τ·(√s − s) = drain/C → √s = (1 + √(1 − 4·drain·τ/(10·C))) / 2.
 * - Draining from full: t = ∫₀¹ C ds / (drain − 10C/τ·(√s − s)); with u = √s
 *   and a² = drain·τ/(10·C) − ¼ that is (τ/10)·(2/a)·atan(1/(2a)).
 */
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
