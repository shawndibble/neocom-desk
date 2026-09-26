/**
 * Combat booster side effects: each booster's own (four apiece), by the
 * dogma effect id the engine switches on (`FitItem.booster_side_effects`),
 * with the penalty the booster carries for it — which the engine then
 * scales by the pilot's Neurotoxin skills, so the shown figure is the
 * booster's base.
 *
 * Read out of the pinned `@eveshipfit/sde` `sde.dat` (2026-09-25): every
 * published booster with a `boosterEffectChance` attribute, and of its
 * effects the `booster…Penalty…` ones (its other effect is the benefit);
 * the penalty is the value of the attribute the effect's modifier reads.
 * Bump with the SDE if CCP adds a booster.
 */

export interface BoosterSideEffect {
  effectId: number;
  /** The booster's base penalty, percent (negative: a reduction). */
  penaltyPct: number;
}

// Effect ids: 2735 armor HP, 2736 armor repair amount, 2737 shield capacity,
// 2739 turret optimal range, 2741 turret falloff, 2745 capacitor capacity,
// 2746 max velocity, 2747 turret tracking, 2748 missile velocity, 2749
// missile explosion velocity, 2791 missile explosion radius, 4970 shield
// boost amount.
const FAMILIES: Readonly<Record<string, readonly number[]>> = {
  crash: [2735, 2746, 2748, 4970],
  bluePill: [2737, 2739, 2745, 2749],
  soothSayer: [2736, 2737, 2739, 2746],
  xInstinct: [2735, 2737, 2741, 2748],
  frentix: [2735, 2746, 2747, 4970],
  mindflood: [2736, 2739, 2791, 4970],
  drop: [2736, 2737, 2741, 2746],
  exile: [2735, 2745, 2747, 2791],
};

/** Standard / Improved / Strong: a 20 / 25 / 30% penalty. */
const BOOSTERS: Readonly<Record<number, { family: keyof typeof FAMILIES; pct: number }>> = {
  9947: { family: 'crash', pct: 20 },
  10151: { family: 'crash', pct: 25 },
  10152: { family: 'crash', pct: 30 },
  9950: { family: 'bluePill', pct: 20 },
  10155: { family: 'bluePill', pct: 25 },
  10156: { family: 'bluePill', pct: 30 },
  10164: { family: 'soothSayer', pct: 20 },
  10165: { family: 'soothSayer', pct: 25 },
  10166: { family: 'soothSayer', pct: 30 },
  15457: { family: 'xInstinct', pct: 20 },
  15458: { family: 'xInstinct', pct: 25 },
  15459: { family: 'xInstinct', pct: 30 },
  15460: { family: 'frentix', pct: 20 },
  15461: { family: 'frentix', pct: 25 },
  15462: { family: 'frentix', pct: 30 },
  15463: { family: 'mindflood', pct: 20 },
  15464: { family: 'mindflood', pct: 25 },
  15465: { family: 'mindflood', pct: 30 },
  15466: { family: 'drop', pct: 20 },
  15477: { family: 'drop', pct: 25 },
  15478: { family: 'drop', pct: 30 },
  15479: { family: 'exile', pct: 20 },
  15480: { family: 'exile', pct: 25 },
  25349: { family: 'exile', pct: 30 },
};

/** The one side effect that grows a figure rather than shrinking it: a bigger explosion radius. */
const GROWS: ReadonlySet<number> = new Set([2791]);

export function boosterSideEffects(boosterTypeId: number): BoosterSideEffect[] {
  const booster = BOOSTERS[boosterTypeId];
  if (!booster) return [];
  return FAMILIES[booster.family].map((effectId) => ({
    effectId,
    penaltyPct: GROWS.has(effectId) ? booster.pct : -booster.pct,
  }));
}

/** Of the side effects the pilot switched on, those that are this booster's own. */
export function sideEffectsSwitchedOn(
  boosterTypeId: number,
  switchedOn: readonly number[] | undefined
): number[] {
  if (!switchedOn || switchedOn.length === 0) return [];
  const own = new Set(boosterSideEffects(boosterTypeId).map((effect) => effect.effectId));
  return switchedOn.filter((effectId) => own.has(effectId));
}
