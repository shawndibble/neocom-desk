import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import type { DetectedOwnedStock } from '@/engine/industry/ownedStock';
import type { OwnedStockDetection } from './ownedStockDetection';

/**
 * Beyond this many locations the breakdown stops being a list and starts being
 * a wall — the tail is summarised as a count instead.
 */
const MAX_BREAKDOWN_ROWS = 5;

interface OwnedStockHintProps {
  /** Every placement galaxy-wide, unfiltered by the plan's owned-stock scope — the breakdown list always shows the full picture. */
  stock: DetectedOwnedStock;
  /**
   * The total narrowed to the plan's owned-stock scope (issue #454), shown as
   * the headline number. Equal to `stock.quantity` when the scope is absent
   * or `everywhere`.
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
 * dense with numbers, in a table now long enough that every repeated word
 * costs a row. The total and the full placement breakdown moved onto the
 * offer's own hover tooltip, where they are read when wanted rather than
 * always; the offer itself is the only thing left on screen.
 *
 * So nothing renders once the offer is taken (`canApply` false) — by then the
 * quantity is in the input beside it, which is the thing the plan actually
 * uses.
 *
 * When any Character's asset list was short or unreadable the total is rendered
 * as a lower bound. Under-reporting owned stock inflates the plan's buy list
 * and cost, so a possibly-short number must never look exact.
 */
export function OwnedStockHint({
  stock,
  scopedQuantity,
  detection,
  materialName,
  suggestion,
  canApply,
  onApply,
}: OwnedStockHintProps) {
  const { t } = useTranslation();
  const shown = stock.placements.slice(0, MAX_BREAKDOWN_ROWS);
  const remaining = stock.placements.length - shown.length;
  // The headline reflects the plan's owned-stock scope (issue #454); the
  // breakdown list below stays the full, unfiltered picture so the player can
  // still see where every unit actually is.
  const quantity = scopedQuantity.toLocaleString();
  // The lower-bound marker is part of the number, so it has to be part of the
  // accessible name too: a name that dropped it would announce a floor as an
  // exact count, and the buy list a player builds on that is wrong low.
  const detected = detection.lowerBound
    ? t('industry.detectedOwnedAtLeast', { quantity })
    : t('industry.detectedOwned', { quantity });

  if (!canApply) return null;

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-1 text-left">
          <span className="font-semibold">{detected}</span>
          <span className="flex flex-col">
            {shown.map((placement) => (
              <span key={`${placement.characterId}:${placement.locationId}`}>
                {t('industry.detectedOwnedPlacement', {
                  character: detection.characterNameFor(placement.characterId),
                  location: detection.locationLabelFor(placement),
                })}
                {': '}
                {placement.quantity.toLocaleString()}
              </span>
            ))}
            {remaining > 0 && (
              <span>{t('industry.detectedOwnedMoreLocations', { more: remaining })}</span>
            )}
          </span>
          {detection.lowerBound && (
            <span className="text-warning">
              {t('industry.detectedOwnedIncomplete', {
                characters: [...detection.incompleteCharacters].join(', '),
              })}
            </span>
          )}
        </span>
      }
    >
      <button
        type="button"
        onClick={onApply}
        aria-label={t('industry.useDetectedFor', {
          quantity: suggestion.toLocaleString(),
          material: materialName,
        })}
        className="flex items-center justify-end rounded-xs text-[0.6875rem] font-semibold text-accent uppercase hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {t('industry.useDetected', { quantity: suggestion.toLocaleString() })}
      </button>
    </Tooltip>
  );
}
