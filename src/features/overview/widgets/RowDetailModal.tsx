import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eyebrow, Modal, ProgressBar, STAT_CHIP_TONE_TEXT_CLASS } from '@/components/ui';
import { Well } from '@/components/ui/Well';
import { Pill } from '@/components/ui/Pill';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { SetDestinationButton } from '@/features/market/SetDestinationButton';
import { JumpsLink } from '@/features/route/JumpsLink';
import type { RowDetailModel } from './data/types';

function Place({ place }: { place: NonNullable<RowDetailModel['place']> }) {
  const { t } = useTranslation();
  return (
    <SetDestinationButton
      locationId={place.structureId ?? place.systemId}
      placeName={place.name}
      routeLink={
        place.jumps === undefined ? undefined : (
          <JumpsLink
            systemId={place.systemId}
            label={t('overview.widgets.rowDetail.routeLabel', { place: place.name })}
          >
            {t('overview.widgets.rowDetail.jumps', { count: place.jumps })}
          </JumpsLink>
        )
      }
    />
  );
}

function Status({ status }: { status: NonNullable<RowDetailModel['status']> }) {
  return (
    <Well size="lg" className="space-y-1.5">
      {status.badge && <Pill tone={status.tone}>{status.badge}</Pill>}
      {status.text && <p className="text-xl font-semibold tabular-nums">{status.text}</p>}
      {status.note && <p className="text-xs text-text-dim">{status.note}</p>}
    </Well>
  );
}

function Facts({ facts }: { facts: RowDetailModel['facts'] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt>
            <Eyebrow>{fact.label}</Eyebrow>
          </dt>
          <dd
            className={`mt-0.5 break-words text-sm ${STAT_CHIP_TONE_TEXT_CLASS[fact.tone ?? 'default']}`}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
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
              {item.badge !== undefined && <Pill tone={item.tone}>{item.badge}</Pill>}
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
  const hasActions = detail !== null && (detail.place !== undefined || detail.link !== undefined);
  return (
    <Modal
      open={detail !== null}
      onClose={onClose}
      title={detail?.title ?? ''}
      placement="detail"
      footer={
        hasActions && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {detail.place && <Place place={detail.place} />}
            {detail.secondaryLink && (
              <Link
                to={detail.secondaryLink.to}
                className={buttonClassName({ className: 'ml-auto' })}
              >
                {detail.secondaryLink.label}
              </Link>
            )}
            {detail.link && (
              <Link
                to={detail.link.to}
                className={buttonClassName({
                  variant: 'primary',
                  className: detail.secondaryLink ? undefined : 'ml-auto',
                })}
              >
                {detail.link.label}
              </Link>
            )}
          </div>
        )
      }
    >
      {detail && (
        <div className="space-y-5">
          {detail.status && <Status status={detail.status} />}
          <Facts facts={detail.facts} />
          {detail.meters && <Meters meters={detail.meters} />}
          {detail.list && <List list={detail.list} />}
        </div>
      )}
    </Modal>
  );
}
