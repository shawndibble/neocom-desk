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
 * - Cap boosters count at their charge-per-cycle rate with no reload, as the
 *   engine's own peak load does: optimistic for a long fight.
 */
import type { LocalRepair } from './types';

/** One running module's capacitor use, as the engine reports it. */
export interface CapacitorUser {
  /** GJ/s at full speed; negative for what a cap booster or a nosferatu adds. */
  capPerSecond: number;
  /**
   * GJ the loaded charge injects. Only a cap booster's shows in its draw — an
   * ancillary shield booster loads the same charges and just runs free on them.
   */
  injectionPerCharge?: number;
}

export interface CapacitorBudget {
  /** GJ/s the capacitor refills at its fastest (25% full). */
  peakRecharge: number;
  /** GJ/s every running module draws. */
  drain: number;
  /** GJ/s cap boosters inject, one charge a cycle, no reload. */
  boosterInjection: number;
  /** GJ/s nosferatu take from their targets. */
  nosferatuGain: number;
  /** Peak recharge + injection + nosferatu − drain; below 0 the capacitor runs down. */
  delta: number;
  /** `delta` as a share of peak recharge, percent. */
  deltaPct: number;
  /**
   * How often a cap booster must inject its biggest loaded charge to hold
   * the capacitor at peak — null when recharge alone keeps up, or no booster
   * is fitted to do it.
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
    const charge = user.injectionPerCharge ?? 0;
    if (user.capPerSecond < 0 && charge > 0) {
      // The engine nets a cap booster's injection into its own draw.
      boosterInjection -= user.capPerSecond;
      biggestCharge = Math.max(biggestCharge, charge);
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
  ancillary?: { cycles: number; cycleSeconds: number; reloadSeconds: number };
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
    let rate = repairer.rate;
    const magazine = repairer.ancillary;
    if (magazine && magazine.cycles > 0) {
      const running = magazine.cycles * magazine.cycleSeconds;
      rate *= running / (running + magazine.reloadSeconds);
    }
    if (repairer.capPerSecond > 0) rate *= capFraction;
    sustained[repairer.layer] += rate;
  }
  return { sustained, capFraction };
}
