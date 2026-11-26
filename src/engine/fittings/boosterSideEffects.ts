import type { FittingImplantSet } from './types';

export interface BoosterSideEffect {
  effectId: number;
  penaltyPct: number;
}

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

const GROWS: ReadonlySet<number> = new Set([2791]);

export function boosterSideEffects(boosterTypeId: number): BoosterSideEffect[] {
  const booster = BOOSTERS[boosterTypeId];
  if (!booster) return [];
  return FAMILIES[booster.family].map((effectId) => ({
    effectId,
    penaltyPct: GROWS.has(effectId) ? booster.pct : -booster.pct,
  }));
}

export function sideEffectsSwitchedOn(
  boosterTypeId: number,
  switchedOn: readonly number[] | undefined
): number[] {
  if (!switchedOn || switchedOn.length === 0) return [];
  const own = new Set(boosterSideEffects(boosterTypeId).map((effect) => effect.effectId));
  return switchedOn.filter((effectId) => own.has(effectId));
}

export function withBoosters(
  set: FittingImplantSet,
  boosters: readonly number[]
): FittingImplantSet {
  const kept = new Set(boosters.flatMap((id) => boosterSideEffects(id).map((e) => e.effectId)));
  const sideEffects = (set.boosterSideEffects ?? []).filter((id) => kept.has(id));
  return {
    implants: set.implants,
    boosters: [...boosters],
    ...(sideEffects.length > 0 ? { boosterSideEffects: sideEffects } : {}),
  };
}
