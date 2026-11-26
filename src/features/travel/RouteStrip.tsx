import { fixed1 } from '@/lib/fixedFormat';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { Tooltip } from '@/components/ui';
import { routeStripKeySystems, type RouteSafetyRow } from '@/engine/route/routeSafety';
import { stepJumps } from '@/engine/route/routeSafetyTrip';
import { securityStatusColor } from '@/engine/securityStatus';
import { routeSystemName } from './routeSystemName';
import type { RouteKillsCell } from './useRouteKills';
import type { RouteSafetyTripRow } from './useRouteSafety';

const STEP_CELL = {
  hole: {
    tip: 'travel.holes.stripCell',
    testId: 'route-strip-hole',
    className: 'route-strip-hole',
  },
  bridge: {
    tip: 'travel.bridges.stripCell',
    testId: 'route-strip-bridge',
    className: 'border-y border-dashed border-line-bright',
  },
  jump: {
    tip: 'travel.jumpDrive.stripCell',
    testId: 'route-strip-jump',
    className: 'border border-dashed border-accent text-accent',
  },
} as const;

function securityText(row: RouteSafetyRow): string {
  return row.security === null ? '—' : fixed1(row.security);
}

function hasKills(row: RouteSafetyRow, cell: RouteKillsCell): boolean {
  return (
    (row.shipKills ?? 0) + (row.podKills ?? 0) > 0 ||
    (cell.status === 'ready' && cell.summary.count > 0)
  );
}

export function RouteStrip({
  rows,
  killsOf,
  stopIndexes,
}: {
  rows: readonly RouteSafetyTripRow[];
  killsOf: (systemId: number) => RouteKillsCell;
  stopIndexes?: readonly number[];
}) {
  const { t } = useTranslation();
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return null;
  const keys = routeStripKeySystems(rows, stopIndexes).flatMap((index) => {
    const row = rows[index];
    return row ? [{ index, row }] : [];
  });
  const describe = (row: RouteSafetyRow) =>
    row.chokepoint
      ? t('travel.strip.systemChokepoint', {
          name: routeSystemName(row),
          security: securityText(row),
        })
      : t('travel.strip.system', { name: routeSystemName(row), security: securityText(row) });
  const withKills = rows.filter((row) => hasKills(row, killsOf(row.systemId)));
  const { holeJumps, bridgeJumps, driveJumps } = stepJumps(rows);
  const label = [
    t('travel.strip.label', {
      count: rows.length,
      from: routeSystemName(first),
      to: routeSystemName(last),
      keys: keys.map((key) => describe(key.row)).join(', '),
    }),
    ...(withKills.length === 0
      ? []
      : [
          t('travel.strip.killsIn', {
            names: [...new Set(withKills.map(routeSystemName))].join(', '),
          }),
        ]),
    ...(holeJumps === 0 ? [] : [t('travel.holes.stripLabel', { count: holeJumps })]),
    ...(bridgeJumps === 0 ? [] : [t('travel.bridges.stripLabel', { count: bridgeJumps })]),
    ...(driveJumps === 0 ? [] : [t('travel.jumpDrive.stripLabel', { count: driveJumps })]),
  ].join(' ');

  return (
    <div>
      <div role="img" aria-label={label} className="flex h-4 gap-px pt-1">
        {rows.map((row, index) => {
          const kills = withKills.includes(row);
          const tip = [describe(row), ...(kills ? [t('travel.strip.kills')] : [])].join('\n');
          const previous = rows[index - 1];
          const step = row.entry && row.entry.kind !== 'gate' ? STEP_CELL[row.entry.kind] : null;
          return (
            <Fragment key={index}>
              {step && previous && (
                <Tooltip
                  content={t(step.tip, {
                    from: routeSystemName(previous),
                    to: routeSystemName(row),
                    distance: row.entry?.kind === 'jump' ? fixed1(row.entry.distanceLy) : '',
                  })}
                >
                  <span
                    data-testid={step.testId}
                    className={`min-w-0 flex-1 overflow-hidden rounded-[1px] bg-panel-2 text-center text-[0.6875rem] leading-[0.875rem] ${step.className}`}
                  >
                    {row.entry?.kind === 'jump' &&
                      t('travel.jumpDrive.stripDistance', {
                        distance: fixed1(row.entry.distanceLy),
                      })}
                  </span>
                </Tooltip>
              )}
              <Tooltip content={tip}>
                <span
                  data-testid="route-strip-cell"
                  className={`relative min-w-0 flex-1 rounded-[1px] ${row.security === null ? 'bg-line' : ''}`}
                  style={
                    row.security === null
                      ? undefined
                      : { backgroundColor: securityStatusColor(row.security) }
                  }
                >
                  {row.chokepoint && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -top-1 h-0.5 bg-warning"
                    />
                  )}
                  {kills && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 left-1/2 size-1 -translate-1/2 rounded-full bg-bg"
                    />
                  )}
                </span>
              </Tooltip>
            </Fragment>
          );
        })}
      </div>
      <ul
        aria-hidden="true"
        className="mt-1 flex flex-wrap justify-between gap-x-3 text-[0.75rem] text-text-dim"
      >
        {keys.map(({ index, row }) => (
          <li key={index} className="inline-flex min-w-0 items-center gap-1">
            <span
              className={`truncate ${row.chokepoint ? 'border-t-2 border-warning text-warning' : ''}`}
            >
              {routeSystemName(row)}
            </span>
            {row.security !== null && <SecurityStatus security={row.security} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
