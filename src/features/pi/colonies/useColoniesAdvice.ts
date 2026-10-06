/**
 * The recommendation model, fed from the live reads: the hook a tab calls to
 * get a `PlanAdvice` (`planAdviceModel.ts`) without owning any of its inputs.
 *
 * The colony snapshot, the hub's prices and the pilot's skills are three reads
 * on three clocks. Prices are keyed on the hub, so changing hub re-prices
 * without refetching a colony; the advice itself is a memo over them and the
 * prefs, so a cadence or market change recomputes without any read at all.
 *
 * Every read degrades rather than failing the tab: no prices means no advice
 * (the caller still has the snapshot, and shows status without money), and an
 * unknown skill is `null`, which the model prices conservatively.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadGoalPlannerSnapshot, type GoalPlannerSnapshot } from '../goalPlannerSnapshot';
import { buildPlanAdvice, type PlanAdvice } from '../planAdviceModel';
import { usePiAdviceInputs } from '../usePiAdviceInputs';

export interface ColoniesAdviceState {
  /** The colony reads the advice was built from; null while loading or after a failure. */
  snapshot: GoalPlannerSnapshot | null;
  /** Null until prices and skills are in, or when the model could not price this pilot. */
  advice: PlanAdvice | null;
  /** The snapshot read failed outright. */
  failed: boolean;
  /** Hub prices could not be read: status still shows, money does not. */
  pricesFailed: boolean;
}

/**
 * @param reloadKey Any value that changes when the colonies must be re-read
 *   (the route's own load stamp), so a manual refresh reaches this read too.
 */
export function useColoniesAdvice(
  characterId: number | null,
  reloadKey: number
): ColoniesAdviceState {
  const [loaded, setLoaded] = useState<{
    characterId: number;
    snapshot: GoalPlannerSnapshot;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<number | null>(null);

  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    loadGoalPlannerSnapshot(characterId).then(
      (snapshot) => {
        if (cancelled) return;
        setFailedFor(null);
        setLoaded({ characterId, snapshot });
      },
      () => {
        if (!cancelled) setFailedFor(characterId);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, reloadKey]);
  const snapshot = loaded?.characterId === characterId ? loaded.snapshot : null;

  const inputs = usePiAdviceInputs(snapshot, characterId, 'isk', reloadKey);
  const advice = useMemo(() => {
    if (inputs.status !== 'ready') return null;
    try {
      return buildPlanAdvice(inputs.input);
    } catch {
      return null;
    }
  }, [inputs]);

  return {
    snapshot,
    advice,
    failed: failedFor === characterId && characterId !== null,
    pricesFailed: inputs.status === 'prices-failed',
  };
}
