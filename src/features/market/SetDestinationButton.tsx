import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { OutcomeNote } from '@/components/OutcomeNote';
import { Button } from '@/components/ui';
import { useSetDestination } from '@/features/travel/useSetDestination';
import { ViewRouteButton } from '@/features/travel/ViewRouteButton';

export function SetDestinationButton({
  locationId,
  placeName,
  routeLink,
}: {
  locationId: number;
  placeName: string;
  routeLink?: ReactNode;
}) {
  const { t } = useTranslation();
  const { blockedReason, sending, outcome, send } = useSetDestination(locationId, placeName);
  const reasonId = useId();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        aria-disabled={blockedReason !== null || undefined}
        aria-describedby={blockedReason !== null ? reasonId : undefined}
        loading={sending}
        aria-label={t('market.orderDetail.setDestinationTo', { placeName })}
        onClick={send}
      >
        {t('market.orderDetail.setDestination')}
      </Button>
      {routeLink ?? <ViewRouteButton locationId={locationId} placeName={placeName} />}
      {blockedReason !== null && (
        <span id={reasonId} className="text-[0.6875rem] text-text-dim">
          {blockedReason}
        </span>
      )}
      <OutcomeNote outcome={outcome} />
    </span>
  );
}
