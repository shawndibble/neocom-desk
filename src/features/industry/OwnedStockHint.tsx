import { useTranslation } from 'react-i18next';
import { Tooltip, textActionClassName } from '@/components/ui';
import type { SiblingClaim } from '@/engine/industry/groupStockClaims';
import type { JobReduction, OwnedStockDetection } from './ownedStockDetection';
import { formatCount } from '@/lib/formatCount';

interface OwnedStockHintProps {
  scopedQuantity: number;
  detection: OwnedStockDetection;
  materialName: string;
  suggestion: number;
  claimedAhead?: readonly SiblingClaim[];
  reduction?: JobReduction | null;
  onApply: () => void;
}

export function OwnedStockHint({
  scopedQuantity,
  detection,
  materialName,
  suggestion,
  claimedAhead = [],
  reduction = null,
  onApply,
}: OwnedStockHintProps) {
  const { t } = useTranslation();

  const quantity = formatCount(scopedQuantity);
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
  const reducedNote =
    reduction === null
      ? null
      : t('industry.jobReducedOffer', {
          quantity: formatCount(reduction.quantity),
          jobs: reduction.blueprintNames.join(', '),
        });
  const owned = [detected, claim, reducedNote].filter((part) => part !== null).join(' · ');

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
        className={textActionClassName('justify-end whitespace-nowrap')}
      >
        {claim === null && reducedNote === null
          ? t('industry.useDetected')
          : t('industry.useDetectedQuantity', { quantity: formatCount(suggestion) })}
      </button>
    </Tooltip>
  );
  const note = [claim, reducedNote].filter((part) => part !== null).join(' · ');
  if (note === '') return offer;
  return (
    <span className="flex flex-wrap items-baseline justify-end gap-x-1">
      <span className="text-[0.6875rem] text-text-dim">
        {note}
        <span aria-hidden="true"> ·</span>
      </span>
      {offer}
    </span>
  );
}
