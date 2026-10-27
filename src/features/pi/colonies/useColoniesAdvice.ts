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
import type { GoalPlannerSnapshot } from '../goalPlannerSnapshot';
import type { PlanAdvice, PlanAdviceInput } from '../planAdviceModel';
import { useAdviceOf } from '../useAdviceOf';
import { usePiAdviceInputs } from '../usePiAdviceInputs';
import { usePiSnapshot } from '../usePiSnapshot';

export interface ColoniesAdviceState {
  /** The colony reads the advice was built from; null while loading or after a failure. */
  snapshot: GoalPlannerSnapshot | null;
  /** Null until prices and skills are in, or when the model could not price this pilot. */
  advice: PlanAdvice | null;
  /** What `advice` was built from: another Character's colonies are priced on the same books. */
  input: PlanAdviceInput | null;
  /** The snapshot read failed outright. */
  failed: boolean;
  /** Hub prices could not be read: status still shows, money does not. */
  pricesFailed: boolean;
}

/**
 * @param reloadKey Any value that changes when the colonies must be re-read
 *   (the route's own load stamp); the PI page's `PiSnapshotProvider` owns the snapshot re-read, so this reaches only the prices load there.
 */
export function useColoniesAdvice(
  characterId: number | null,
  reloadKey: number
): ColoniesAdviceState {
  const { snapshot, failed } = usePiSnapshot(characterId, reloadKey);

  const inputs = usePiAdviceInputs(snapshot, characterId, 'isk', reloadKey);
  const built = useAdviceOf(inputs.status === 'ready' ? inputs.input : null);
  const advice = built.status === 'ready' ? built.advice : null;

  return {
    snapshot,
    advice,
    input: inputs.status === 'ready' ? inputs.input : null,
    failed,
    pricesFailed: inputs.status === 'prices-failed',
  };
}
