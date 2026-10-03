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
 * One `role="img"`, not a tab stop per cell: a 40-jump route would otherwise
 * be 40 stops the table below already covers.
 */
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { Tooltip } from '@/components/ui';
import { routeStripKeySystems, type RouteSafetyRow } from '@/engine/route/routeSafety';
import { securityStatusColor } from '@/engine/securityStatus';
import { routeSystemName } from './routeSystemName';
import type { RouteKillsCell } from './useRouteKills';

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
}: {
  rows: readonly RouteSafetyRow[];
  killsOf: (systemId: number) => RouteKillsCell;
}) {
  const { t } = useTranslation();
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return null;
  const keys = routeStripKeySystems(rows).flatMap((index) => {
    const row = rows[index];
    return row ? [row] : [];
  });
  const describe = (row: RouteSafetyRow) =>
    row.chokepoint
      ? t('travel.strip.systemChokepoint', {
          name: routeSystemName(row),
          security: securityText(row),
        })
      : t('travel.strip.system', { name: routeSystemName(row), security: securityText(row) });
  const label = t('travel.strip.label', {
    count: rows.length,
    from: routeSystemName(first),
    to: routeSystemName(last),
    keys: keys.map(describe).join(', '),
  });

  return (
    <div>
      <div role="img" aria-label={label} className="flex h-4 gap-px pt-1">
        {rows.map((row) => {
          const kills = hasKills(row, killsOf(row.systemId));
          const tip = [describe(row), ...(kills ? [t('travel.strip.kills')] : [])].join('\n');
          return (
            <Tooltip key={row.systemId} content={tip}>
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
                  <span aria-hidden="true" className="absolute inset-x-0 -top-1 h-0.5 bg-warning" />
                )}
                {kills && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 left-1/2 size-1 -translate-1/2 rounded-full bg-bg"
                  />
                )}
              </span>
            </Tooltip>
          );
        })}
      </div>
      {/* Written out for sight; the strip's own label already speaks them. */}
      <ul
        aria-hidden="true"
        className="mt-1 flex flex-wrap justify-between gap-x-3 text-[0.75rem] text-text-dim"
      >
        {keys.map((row) => (
          <li key={row.systemId} className="inline-flex min-w-0 items-center gap-1">
            <span className={`truncate ${row.chokepoint ? 'text-warning' : ''}`}>
              {routeSystemName(row)}
            </span>
            {row.security !== null && <SecurityStatus security={row.security} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
