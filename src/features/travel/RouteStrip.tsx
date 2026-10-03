/**
 * Route Safety's route strip (issue #2474): one cell per system, coloured by
 * security, so the shape of a trip reads at a glance before its rows.
 *
 * Colour is never the only signal (DESIGN.md §7): the strip carries a
 * spoken description, every cell names its system and security on hover,
 * and the key systems — both ends, the lowest security, every Gank
 * Chokepoint — are written out under it. A chokepoint has a line over its
 * cell and a system with kills in the last hour a mark inside it.
 *
 * A jump through a Thera / Turnur hole (issue #2476) is a hatched cell of
 * its own between its two systems' cells: a step, with no security to colour.
 *
 * One `role="img"`, not a tab stop per cell: a 40-jump route would otherwise
 * be 40 stops the table below already covers.
 */
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { Tooltip } from '@/components/ui';
import { routeStripKeySystems, type RouteSafetyRow } from '@/engine/route/routeSafety';
import { securityStatusColor } from '@/engine/securityStatus';
import { routeSystemName } from './routeSystemName';
import type { RouteKillsCell } from './useRouteKills';
import type { HoleAt } from './useRouteSafety';

function securityText(row: RouteSafetyRow): string {
  return row.security === null ? '—' : row.security.toFixed(1);
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
  holeAt,
}: {
  rows: readonly RouteSafetyRow[];
  killsOf: (systemId: number) => RouteKillsCell;
  /** On a trip through several Stops, where each one falls: those are key systems too. */
  stopIndexes?: readonly number[];
  /** The hole a step crosses, or `null` for a stargate jump. */
  holeAt?: HoleAt;
}) {
  const { t } = useTranslation();
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return null;
  // A trip can cross a system twice, so cells key by position, not system.
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
  // Whether the step into each row was through a hole.
  const holeInto = rows.map((row, index) => {
    const previous = rows[index - 1];
    return previous !== undefined && holeAt?.(previous.systemId, row.systemId) != null;
  });
  const holeJumps = holeInto.filter(Boolean).length;
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
  ].join(' ');

  return (
    <div>
      <div role="img" aria-label={label} className="flex h-4 gap-px pt-1">
        {rows.map((row, index) => {
          const kills = withKills.includes(row);
          const tip = [describe(row), ...(kills ? [t('travel.strip.kills')] : [])].join('\n');
          const previous = rows[index - 1];
          return (
            <Fragment key={index}>
              {holeInto[index] && previous && (
                <Tooltip
                  content={t('travel.holes.stripCell', {
                    from: routeSystemName(previous),
                    to: routeSystemName(row),
                  })}
                >
                  <span
                    data-testid="route-strip-hole"
                    className="route-strip-hole min-w-0 flex-1 rounded-[1px] bg-panel-2"
                  />
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
      {/* Written out for sight; the strip's own label already speaks them. */}
      <ul
        aria-hidden="true"
        className="mt-1 flex flex-wrap justify-between gap-x-3 text-[0.75rem] text-text-dim"
      >
        {keys.map(({ index, row }) => (
          <li key={index} className="inline-flex min-w-0 items-center gap-1">
            {/* The strip's own top line, so a chokepoint is never colour alone. */}
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
