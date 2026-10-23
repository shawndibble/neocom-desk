/**
 * Modal for a widget row with a `detail` (DESIGN §6c): an optional status line,
 * its facts, optional bars and list, then where it is. Set destination goes to
 * the EVE client; the jump count links to Route Safety.
 */
import { useTranslation } from 'react-i18next';
import { Eyebrow, Modal, ProgressBar, StatChip, StatChips } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
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

function Status({ status }: { status: NonNullable<RowDetailModel['status']> }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill tone={status.tone}>{status.badge}</Pill>
        {status.text && <span>{status.text}</span>}
      </div>
      {status.note && <p className="text-xs text-text-dim">{status.note}</p>}
    </div>
  );
}

function Meters({ meters }: { meters: NonNullable<RowDetailModel['meters']> }) {
  return (
    <section className="space-y-3">
      <Eyebrow>{meters.title}</Eyebrow>
      {meters.items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span>
              {item.label} <Pill>{item.badge}</Pill>
            </span>
            <span className="tabular-nums text-text-dim">{item.readout}</span>
          </div>
          <ProgressBar value={item.value} max={item.max} label={item.label} />
          {item.note && <p className="mt-1 text-xs text-text-dim">{item.note}</p>}
        </div>
      ))}
    </section>
  );
}

function List({ list }: { list: NonNullable<RowDetailModel['list']> }) {
  return (
    <section className="space-y-2">
      <Eyebrow>{list.title}</Eyebrow>
      <ul className="divide-y divide-line text-sm">
        {list.items.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3 py-1.5">
            <span className="flex min-w-0 items-center gap-2">
              <Pill tone={item.tone}>{item.badge}</Pill>
              <span className="truncate">{item.text}</span>
            </span>
            <span className="shrink-0 tabular-nums text-text-dim">{item.value}</span>
          </li>
        ))}
      </ul>
    </section>
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
          {detail.status && <Status status={detail.status} />}
          <StatChips>
            {detail.facts.map((fact) => (
              <StatChip key={fact.label} label={fact.label} value={fact.value} />
            ))}
          </StatChips>
          {detail.meters && <Meters meters={detail.meters} />}
          {detail.list && <List list={detail.list} />}
          {detail.place && <Place place={detail.place} />}
        </div>
      )}
    </Modal>
  );
}
