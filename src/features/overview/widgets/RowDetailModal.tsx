/**
 * Modal for a widget row with a `detail` (DESIGN §6c): its facts, then where it
 * is. Set destination goes to the EVE client; the jump count links to Route Safety.
 */
import { useTranslation } from 'react-i18next';
import { Modal, StatChip, StatChips } from '@/components/ui';
import { SetDestinationButton } from '@/features/market/SetDestinationButton';
import { JumpsLink } from '@/features/route/JumpsLink';
import type { RowDetailModel } from './data/types';

function Place({ place }: { place: NonNullable<RowDetailModel['place']> }) {
  const { t } = useTranslation();
  return (
    <SetDestinationButton
      locationId={place.systemId}
      placeName={place.name}
      routeLink={
        <JumpsLink
          systemId={place.systemId}
          label={t('overview.widgets.rowDetail.routeLabel', { place: place.name })}
        >
          {place.jumps === undefined
            ? t('overview.widgets.rowDetail.route')
            : t('overview.widgets.rowDetail.jumps', { count: place.jumps })}
        </JumpsLink>
      }
    />
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
