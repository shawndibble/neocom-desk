import { useTranslation } from 'react-i18next';
import { Tooltip, textActionClassName } from '@/components/ui';
import type { SiblingClaim } from '@/engine/industry/groupStockClaims';
import type { OwnedStockDetection } from './ownedStockDetection';
import { formatCount } from '@/lib/formatCount';

interface OwnedStockHintProps {
  /**
   * The total narrowed to the plan's owned-stock scope (issue #454). Equal to
   * the galaxy-wide total when the scope is absent or `everywhere`.
   */
  scopedQuantity: number;
  detection: OwnedStockDetection;
  materialName: string;
  /** What the "use" action writes — the row's owned-stock offer (`ownedStockOffer`). */
  suggestion: number;
  /**
   * Stock Build Group members ahead of this plan already claimed (issue
   * #3992), already taken out of `suggestion`. Empty or absent: no claim.
   */
  claimedAhead?: readonly SiblingClaim[];
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
 * rather than always. The offer itself now reads "Use assets" rather than
 * "Use 2,316,600": the number wrapped the Have column onto a second line, and
 * the Need column beside it already says how much the click covers.
 *
 * The tooltip is that total and nothing else. An earlier pass put the whole
 * per-Character, per-station placement list in there too, which turned a 14rem
 * hover bubble into a panel: not dismissible, not scrollable, and on touch
 * reachable only by long-pressing a button whose tap commits a value. A
 * breakdown that size needs a surface that opens and closes, and once the
 * "N owned" text it used to hang off was gone it had no trigger left — so it
 * is dropped rather than badly housed.
 *
 * Rendered only while the row has an offer: `ownedStockOffer`
 * (`src/engine/industry/ownedStockOffer.ts`) decides that, and the caller
 * leaves this out once it answers `null` — by then the quantity is in the
 * input beside it, which is the thing the plan actually uses.
 *
 * Inside a Build Group, stock a member ahead of this plan already claimed is
 * named beside the offer — "6,000 in Plan A · Use 4,000" — and the offer says
 * its number, since Need no longer says how much the click covers once a
 * sibling's claim is taken out (issue #3992).
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
  claimedAhead = [],
  onApply,
}: OwnedStockHintProps) {
  const { t } = useTranslation();

  const quantity = formatCount(scopedQuantity);
  // The lower-bound marker is part of the number, so it has to be part of the
  // accessible name too: a name that dropped it would announce a floor as an
  // exact count, and the buy list a player builds on that is wrong low.
  const detected = detection.lowerBound
    ? t('industry.detectedOwnedAtLeast', { quantity })
    : t('industry.detectedOwned', { quantity });
  const claimedQuantity = claimedAhead.reduce((sum, claim) => sum + claim.quantity, 0);
  const claim =
    claimedAhead.length === 0
      ? null
      : claimedAhead.length === 1
        ? t('industry.groupClaimedIn', {
            quantity: formatCount(claimedQuantity),
            plan: claimedAhead[0].name,
          })
        : t('industry.groupClaimedInPlans', {
            quantity: formatCount(claimedQuantity),
            count: claimedAhead.length,
          });
  const owned = claim === null ? detected : `${detected} · ${claim}`;

  const offer = (
    <Tooltip content={owned}>
      <button
        type="button"
        onClick={onApply}
        aria-label={t('industry.useDetectedFor', {
          quantity: formatCount(suggestion),
          material: materialName,
          detected: owned,
        })}
        className={textActionClassName('justify-end')}
      >
        {/* Not the number: it made the Have column wrap, and Need beside the
            field plus this tooltip already say how much. The accessible name
            above still carries what a click will write. */}
        {claim === null
          ? t('industry.useDetected')
          : t('industry.useDetectedQuantity', { quantity: formatCount(suggestion) })}
      </button>
    </Tooltip>
  );
  if (claim === null) return offer;
  return (
    <span className="flex flex-wrap items-baseline justify-end gap-x-1">
      <span className="text-[0.6875rem] text-text-dim">
        {claim}
        <span aria-hidden="true"> ·</span>
      </span>
      {offer}
    </span>
  );
}
