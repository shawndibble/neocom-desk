import { useTranslation } from 'react-i18next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui';
import type { DetectedOwnedStock } from '@/engine/industry/ownedStock';
import type { OwnedStockDetection } from './ownedStockDetection';

/**
 * Beyond this many locations the breakdown stops being a list and starts being
 * a wall — the tail is summarised as a count instead.
 */
const MAX_BREAKDOWN_ROWS = 5;

interface OwnedStockHintProps {
  stock: DetectedOwnedStock;
  detection: OwnedStockDetection;
  materialName: string;
  /** What the "use" action writes: min(detected, required). */
  suggestion: number;
  /** False when the row's stored value already equals `suggestion` — nothing left to apply. */
  canApply: boolean;
  onApply: () => void;
}

/**
 * The detected-owned-stock line under a material's "Owned" input (issue #181).
 *
 * The number is a suggestion, never a stored value: detection writes nothing,
 * and this row's "use" action goes through the same sourcing-change callback
 * typing into the input does. It writes `min(detected, required)` rather than
 * the raw total, because the field means "units of this material this plan
 * draws on" — the engine already clamps to that range, and storing an oversized
 * number would silently cover a larger requirement if `runs` went up later.
 *
 * When any Character's asset list was short or unreadable the total is rendered
 * as a lower bound. Under-reporting owned stock inflates the plan's buy list
 * and cost, so a possibly-short number must never look exact.
 */
export function OwnedStockHint({
  stock,
  detection,
  materialName,
  suggestion,
  canApply,
  onApply,
}: OwnedStockHintProps) {
  const { t } = useTranslation();
  const shown = stock.placements.slice(0, MAX_BREAKDOWN_ROWS);
  const remaining = stock.placements.length - shown.length;
  const quantity = stock.quantity.toLocaleString();

  return (
    <span className="flex items-center justify-end gap-2 text-[0.6875rem] text-text-dim">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('industry.detectedOwnedFor', { material: materialName })}
            className="rounded-xs underline decoration-dotted underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {detection.lowerBound
              ? t('industry.detectedOwnedAtLeast', { quantity })
              : t('industry.detectedOwned', { quantity })}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-80 p-2 text-left text-xs font-normal">
          <p className="font-semibold text-text">
            {t('industry.detectedOwnedTitle', { material: materialName })}
          </p>
          <ul className="mt-1 space-y-0.5">
            {shown.map((placement) => (
              <li
                key={`${placement.characterId}:${placement.locationId}`}
                className="flex justify-between gap-3"
              >
                <span>
                  {t('industry.detectedOwnedPlacement', {
                    character: detection.characterNameFor(placement.characterId),
                    location: detection.locationLabelFor(placement),
                  })}
                </span>
                <span className="tabular-nums">{placement.quantity.toLocaleString()}</span>
              </li>
            ))}
            {remaining > 0 && (
              <li className="text-text-faint">
                {t('industry.detectedOwnedMoreLocations', { more: remaining })}
              </li>
            )}
          </ul>
          {detection.lowerBound && (
            <p className="mt-2 text-warning">
              {t('industry.detectedOwnedIncomplete', {
                characters: [...detection.incompleteCharacters].join(', '),
              })}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canApply && (
        <button
          type="button"
          onClick={onApply}
          aria-label={t('industry.useDetectedFor', { material: materialName })}
          className="rounded-xs font-semibold text-accent uppercase hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t('industry.useDetected', { quantity: suggestion.toLocaleString() })}
        </button>
      )}
    </span>
  );
}
