import { useId, useState } from 'react';
import { formatCount } from '@/lib/formatCount';
import { useTranslation } from 'react-i18next';
import { Button, Panel, StatChip, StatChips } from '@/components/ui';
import { HAUL_SHIPS } from '@/engine/pi/planHaul';
import type { HaulView } from '../planView';
import { formatNumber } from '@/lib/numberLocale';

function formatTrips(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function HaulingPanel({ hauling, hubName }: { hauling: HaulView; hubName: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const { route, fit } = hauling;
  const lowsec = route.kind === 'route' ? (route.lowsec ?? 0) : 0;
  const nullsec = route.kind === 'route' ? (route.nullsec ?? 0) : 0;
  const m3 = (value: number | null) =>
    value === null ? '—' : t('piPlan.make.m3PerTrip', { value: formatCount(value) });
  const fitKey =
    fit.kind === 'unknown'
      ? 'piPlan.make.fitUnknown'
      : fit.smallest === 'frigate'
        ? 'piPlan.make.fitFrigate'
        : fit.smallest === 'industrial'
          ? 'piPlan.make.fitIndustrial'
          : fit.smallest === 'epithal'
            ? 'piPlan.make.fitEpithal'
            : 'piPlan.make.fitTooBig';
  return (
    <Panel
      title={t('piPlan.make.haulTitle')}
      wrapMeta
      meta={
        <span className="flex flex-wrap max-md:basis-full items-center gap-1.5 text-[0.6875rem] text-text-dim tabular-nums">
          <span>
            {t('piPlan.make.haulSummary', {
              trip: m3(hauling.m3PerTrip),
              trips: formatTrips(hauling.tripsPerWeek),
            })}
          </span>
          {lowsec > 0 && (
            <StatChip
              label={t('piPlan.make.lowsecChip')}
              tone="warning"
              value={t('piPlan.make.jumps', { count: lowsec })}
            />
          )}
          {nullsec > 0 && (
            <StatChip
              label={t('piPlan.make.nullsecChip')}
              tone="danger"
              value={t('piPlan.make.jumps', { count: nullsec })}
            />
          )}
        </span>
      }
      actions={
        <Button
          size="sm"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen(!open)}
        >
          {t(open ? 'piPlan.make.haulHide' : 'piPlan.make.haulShow')}
        </Button>
      }
      padded={false}
    >
      {open && (
        <div id={detailsId}>
          <div className="space-y-2 p-3">
            <StatChips>
              <StatChip label={t('piPlan.make.haulChip')} value={m3(hauling.m3PerTrip)} />
              <StatChip label={t('piPlan.make.todayChip')} value={m3(hauling.todayM3PerTrip)} />
              <StatChip
                label={t('piPlan.make.tripsChip')}
                value={t('piPlan.make.tripsPerWeek', { value: formatTrips(hauling.tripsPerWeek) })}
              />
              <StatChip
                label={t('piPlan.make.routeChip')}
                value={
                  route.kind === 'local'
                    ? t('piPlan.make.routeLocal')
                    : route.kind === 'route'
                      ? t('piPlan.strip.jumps', { count: route.jumps, hub: hubName })
                      : t('piPlan.make.routeUnknown')
                }
              />
              {route.kind === 'route' && route.lowsec !== null && route.lowsec > 0 && (
                <StatChip
                  label={t('piPlan.make.lowsecChip')}
                  tone="warning"
                  value={t('piPlan.make.jumps', { count: route.lowsec })}
                />
              )}
              {route.kind === 'route' && route.nullsec !== null && route.nullsec > 0 && (
                <StatChip
                  label={t('piPlan.make.nullsecChip')}
                  tone="danger"
                  value={t('piPlan.make.jumps', { count: route.nullsec })}
                />
              )}
              <StatChip
                label={t('piPlan.make.resetChip')}
                value={t('piPlan.make.resetEvery', { count: hauling.restartDays })}
              />
              {hauling.rebuildMinutes > 0 && (
                <StatChip
                  label={t('piPlan.make.rebuildChip')}
                  value={t('piPlan.make.rebuildOnce', { count: hauling.rebuildMinutes })}
                />
              )}
            </StatChips>
            <p className="text-sm text-text">
              {t(fitKey, { trips: fit.industrialTrips })}
              {!hauling.complete && <> {t('piPlan.make.haulPartial')}</>}
            </p>
            {fit.ships.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem]">
                {fit.ships.map((ship) => {
                  const spec = HAUL_SHIPS.find((s) => s.id === ship.id)!;
                  return (
                    <li key={ship.id} className={ship.fits ? 'text-success' : 'text-text-dim'}>
                      <span aria-hidden="true">{ship.fits ? '✓' : '✕'}</span>{' '}
                      {t(`piPlan.make.ship.${ship.id}`, { m3: formatNumber(spec.m3) })}
                      <span className="sr-only">
                        {' '}
                        {ship.fits ? t('piPlan.make.shipFits') : t('piPlan.make.shipNoFit')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
