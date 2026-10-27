/**
 * Buying P2 and P3 for a partial chain (`PlannerPolicy.buyTiers`), as shares on
 * each goal (`Goal.buyShare`) that the other steps read through `chainRates`.
 *
 * The rule is the **lowest allowed tier that closes the gap**: a gap is bought
 * at the nearest buyable ancestor above it, never higher, and everything above
 * that is still made. A pilot who buys P1 never needs this (P1 closes every
 * gap), and one who buys nothing has no shares at all, so both leave the
 * solver exactly as it was.
 *
 * Two kinds of gap, found at two moments:
 * - a **type gap** is known before anything is solved: no colony's planet type
 *   yields the P0 under some P1. The ancestor is bought in full;
 * - a **short P1** is known only after a solve: the colonies that could yield
 *   it are full, or a scarcer input rations it. The same ancestor is bought in
 *   the share the P1 falls short of its demand, and the plan is solved again
 *   with the demand reduced.
 *
 * A goal's own type is bought outright only by `planGoals`' existing path for
 * goals it cannot make; here it is bought only as the part a short P1 leaves open.
 */
import type { PiData } from '@/sde/types';
import { piTier } from '../chain';
import type { Goal, PlannerColony, PlannerPolicy } from '../goalTypes';
import { EPSILON, schematicOf } from './shared';

/** True when P1 is not bought but P2 or P3 is: the only case this step acts in. */
export function buysHigherTiers(policy: PlannerPolicy): boolean {
  return !policy.buyTiers.includes(1) && policy.buyTiers.some((tier) => tier === 2 || tier === 3);
}

const withShares = (g: Goal, shares: ReadonlyMap<number, number>): Goal => ({
  ...g,
  buyShare: shares,
});

/**
 * Buys, in full, the lowest buyable type above each P1 no colony can yield.
 * A goal that cannot be closed this way is returned unchanged for triage to
 * block (and `planGoals` to buy outright when its own tier is allowed).
 */
export function withTypeGapPurchases(
  goals: readonly Goal[],
  colonies: readonly PlannerColony[],
  policy: PlannerPolicy,
  pi: PiData
): Goal[] {
  if (!buysHigherTiers(policy)) return [...goals];
  const yieldable = (p0: number) => colonies.some((c) => c.ratePerEcu.has(p0));
  const buyable = (typeId: number) => policy.buyTiers.includes(piTier(typeId, pi));
  type Result = { state: 'ok' | 'bought' | 'blocked'; buys: Set<number> };
  const memo = new Map<number, Result>();
  const resolve = (typeId: number): Result => {
    const known = memo.get(typeId);
    if (known) return known;
    const tier = piTier(typeId, pi);
    let result: Result;
    if (tier === 0) {
      result = { state: 'ok', buys: new Set() };
    } else if (tier === 1) {
      const p0 = schematicOf(typeId, pi).inputs[0].typeID;
      result = { state: yieldable(p0) ? 'ok' : 'blocked', buys: new Set() };
    } else {
      const inputs = schematicOf(typeId, pi).inputs.map((i) => i.typeID);
      const children = inputs.map(resolve);
      if (children.every((c) => c.state !== 'blocked')) {
        const buys = new Set<number>();
        children.forEach((c, i) => {
          if (c.state === 'bought') buys.add(inputs[i]);
          c.buys.forEach((id) => buys.add(id));
        });
        result = { state: 'ok', buys };
      } else if (buyable(typeId)) {
        result = { state: 'bought', buys: new Set() };
      } else {
        result = { state: 'blocked', buys: new Set() };
      }
    }
    memo.set(typeId, result);
    return result;
  };
  return goals.map((g) => {
    const result = resolve(g.typeId);
    // The goal's own type (bought outright) and a goal nothing closes are
    // triage's to handle, with no shares.
    if (result.state !== 'ok' || result.buys.size === 0) return g;
    return withShares(g, new Map([...result.buys].map((id) => [id, 1])));
  });
}

/**
 * Buys, per goal, the share of the lowest buyable ancestor that a short P1 is
 * short of its demand. `gapShare` is that fraction per P1 holding a goal back.
 * Returns null when nothing changed (no buyable ancestor, or already bought
 * in full), which ends the re-plan loop.
 */
export function withShortPurchases(
  goals: readonly Goal[],
  gapShare: ReadonlyMap<number, number>,
  policy: PlannerPolicy,
  pi: PiData
): Goal[] | null {
  let changed = false;
  const next = goals.map((g) => {
    const extra = new Map<number, number>();
    const walk = (typeId: number, ancestors: readonly number[]): void => {
      const own = g.buyShare?.get(typeId) ?? 0;
      if (own >= 1 - EPSILON) return;
      const tier = piTier(typeId, pi);
      const gap = tier === 1 ? gapShare.get(typeId) : undefined;
      if (gap !== undefined) {
        const above = [...ancestors]
          .reverse()
          .find((id) => policy.buyTiers.includes(piTier(id, pi)));
        if (above !== undefined) extra.set(above, Math.max(extra.get(above) ?? 0, gap));
        return;
      }
      if (tier < 2) return;
      for (const input of schematicOf(typeId, pi).inputs) {
        walk(input.typeID, [...ancestors, typeId]);
      }
    };
    walk(g.typeId, []);
    if (extra.size === 0) return g;
    const shares = new Map(g.buyShare);
    for (const [id, gap] of extra) {
      const own = shares.get(id) ?? 0;
      const raised = Math.min(1, own + (1 - own) * Math.min(1, gap));
      if (raised > own + EPSILON) changed = true;
      shares.set(id, raised);
    }
    return withShares(g, shares);
  });
  return changed ? next : null;
}
