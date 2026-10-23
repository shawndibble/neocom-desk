/**
 * The modal a widget table row opens when its kind gives it a `detail`
 * (DESIGN §6c "Widget rows"): the row's facts, then where it is. Set
 * destination sends the system to the EVE client; the jump count is the link
 * to Route Safety, so the modal needs no external map link. Plain data in,
 * so any kind's builder stays pure.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, StatChip, StatChips } from '@/components/ui';
import { JumpsLink } from '@/features/route/JumpsLink';
import { useSetDestination } from '@/features/travel/useSetDestination';
import type { RowDetailModel } from './data/types';

function Place({ place }: { place: NonNullable<RowDetailModel['place']> }) {
  const { t } = useTranslation();
  const { blockedReason, sending, outcome, send } = useSetDestination(place.systemId, place.name);
  const reasonId = useId();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        // Stays focusable with its reason linked, rather than the native attribute (§6c Disabled).
        aria-disabled={blockedReason !== null || undefined}
        aria-describedby={blockedReason !== null ? reasonId : undefined}
        loading={sending}
        aria-label={t('market.orderDetail.setDestinationTo', { placeName: place.name })}
        onClick={send}
      >
        {t('market.orderDetail.setDestination')}
      </Button>
      <JumpsLink
        systemId={place.systemId}
        label={t('overview.widgets.rowDetail.routeLabel', { place: place.name })}
      >
        {place.jumps === undefined
          ? t('overview.widgets.rowDetail.route')
          : t('overview.widgets.rowDetail.jumps', { count: place.jumps })}
      </JumpsLink>
      {blockedReason !== null && (
        <span id={reasonId} className="text-[0.6875rem] text-text-dim">
          {blockedReason}
        </span>
      )}
      {outcome && (
        <span
          role={outcome.tone}
          className={outcome.tone === 'alert' ? 'text-xs text-danger' : 'text-xs text-success'}
        >
          {outcome.text}
        </span>
      )}
    </div>
  );
}

export function RowDetailModal({
  detail,
  onClose,
}: {
  detail: RowDetailModel | null;
  onClose: () => void;
}) {
  return (
    <Modal open={detail !== null} onClose={onClose} title={detail?.title ?? ''}>
      {detail && (
        <div className="space-y-4">
          <StatChips>
            {detail.facts.map((fact) => (
              <StatChip key={fact.label} label={fact.label} value={fact.value} />
            ))}
          </StatChips>
          {detail.place && <Place place={detail.place} />}
        </div>
      )}
    </Modal>
  );
}
