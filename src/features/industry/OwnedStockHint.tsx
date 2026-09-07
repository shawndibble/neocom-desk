import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import type { OwnedStockDetection } from './ownedStockDetection';

interface OwnedStockHintProps {
  /**
   * The total narrowed to the plan's owned-stock scope (issue #454). Equal to
   * the galaxy-wide total when the scope is absent or `everywhere`.
   */
  scopedQuantity: number;
  detection: OwnedStockDetection;
  materialName: string;
  /** What the "use" action writes: min(scoped detected, required). */
  suggestion: number;
  /** False when the row's stored value already equals `suggestion` — nothing left to apply. */
  canApply: boolean;
  onApply: () => void;
}

/**
 * The detected-owned-stock offer under a material's "Owned" input (issue #181).
 *
 * The number is a suggestion, never a stored value: detection writes nothing,
 * and this row's "use" action goes through the same sourcing-change callback
 * typing into the input does. It writes `min(detected, required)` rather than
 * the raw total, because the field means "units of this material this plan
 * draws on" — the engine already clamps to that range, and storing an oversized
 * number would silently cover a larger requirement if `runs` went up later.
 *
 * One control, not two. This used to print the detected total beside the offer
 * — "16 owned   USE 16" — which said the same number twice in a column already
 * dense with numbers, in a table long enough that every repeated word costs a
 * row. The total moved onto the offer's own hover tooltip, read when wanted
 * rather than always.
 *
 * The tooltip is that total and nothing else. An earlier pass put the whole
 * per-Character, per-station placement list in there too, which turned a 14rem
 * hover bubble into a panel: not dismissible, not scrollable, and on touch
 * reachable only by long-pressing a button whose tap commits a value. A
 * breakdown that size needs a surface that opens and closes, and once the
 * "N owned" text it used to hang off was gone it had no trigger left — so it
 * is dropped rather than badly housed.
 *
 * Nothing renders once the offer is taken (`canApply` false): by then the
 * quantity is in the input beside it, which is the thing the plan actually
 * uses.
 *
 * When any Character's asset list was short or unreadable the total is rendered
 * as a lower bound. Under-reporting owned stock inflates the plan's buy list
 * and cost, so a possibly-short number must never look exact.
 */
export function OwnedStockHint({
  scopedQuantity,
  detection,
  materialName,
  suggestion,
  canApply,
  onApply,
}: OwnedStockHintProps) {
  const { t } = useTranslation();
  if (!canApply) return null;

  const quantity = scopedQuantity.toLocaleString();
  // The lower-bound marker is part of the number, so it has to be part of the
  // accessible name too: a name that dropped it would announce a floor as an
  // exact count, and the buy list a player builds on that is wrong low.
  const detected = detection.lowerBound
    ? t('industry.detectedOwnedAtLeast', { quantity })
    : t('industry.detectedOwned', { quantity });

  return (
    <Tooltip content={detected}>
      <button
        type="button"
        onClick={onApply}
        aria-label={t('industry.useDetectedFor', {
          quantity: suggestion.toLocaleString(),
          material: materialName,
          detected,
        })}
        className="flex items-center justify-end rounded-xs text-[0.6875rem] font-semibold text-accent uppercase hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {t('industry.useDetected', { quantity: suggestion.toLocaleString() })}
      </button>
    </Tooltip>
  );
}
