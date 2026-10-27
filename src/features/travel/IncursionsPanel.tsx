/**
 * Route Safety's "Incursions near you" (issue #3540): every active Incursion
 * from ESI's public feed, nearest first, counted from the pilot's Current
 * System with their own route rules — the same jump basis Route Safety draws
 * its route with. "Route" adds the staging system as a stop.
 *
 * Conditions, never verdicts: the row says the state, influence and distance,
 * never whether a site is worth running. Folded by default and remembered per
 * device; folded, it still names the nearest one.
 */
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { Button, CollapsiblePanel, LiveStatus, Tooltip } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import type { IncursionRow } from '@/engine/incursions/incursionRows';
import type { CurrentSystemState } from '@/features/route/currentSystem';
import { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import { cx } from '@/lib/cx';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useIncursionsPanelOpen } from './incursionsData';
import { INCURSION_STATE_TONE } from './incursionStateTone';
import { useIncursions } from './useIncursions';

/** What Route can do for a staging system: add it, or why not (already on the trip, stops full). */
export type RouteAction = 'add' | 'on-route' | 'full';

export function IncursionsPanel({
  current,
  routeAction,
  onRoute,
}: {
  current: Pick<CurrentSystemState, 'systemId' | 'loaded'>;
  routeAction: (systemId: number) => RouteAction;
  onRoute: (systemId: number) => void;
}) {
  const { t } = useTranslation();
  const open = useIncursionsPanelOpen((s) => s.value);
  useHydratedStore(useIncursionsPanelOpen);
  const systems = useSolarSystemIndex();
  const { feed, rows, constellationNames: names, jumpsStatus, retry } = useIncursions(current);
  // Retry unmounts into "reading…": focus waits on the panel body, never `<body>` (§7).
  const [bodyRef, , holdRetryFocus] = useRetryFocus(
    feed === undefined ? 'busy' : feed === null ? 'failed' : 'ok',
    'incursions'
  );
  const systemName = (id: number) => systems?.get(id)?.name ?? t('travel.stops.unnamed', { id });
  const nearest = rows[0];

  const jumpsText = (row: IncursionRow) => {
    if (row.jumps !== null) return t('travel.incursions.jumps', { count: row.jumps });
    if (jumpsStatus === 'ready') return t('travel.incursions.noRoute');
    // Each row says why it has no distance, rather than leaving it blank.
    if (jumpsStatus === 'no-origin') return t('travel.incursions.noOriginRow');
    if (jumpsStatus === 'unknown') return t('travel.incursions.unknownRow');
    return null;
  };

  const status =
    feed === undefined
      ? t('travel.incursions.loading')
      : feed === null
        ? t('travel.incursions.failed')
        : rows.length === 0
          ? t('travel.incursions.none')
          : null;

  const originNote =
    jumpsStatus === 'no-origin'
      ? t('travel.incursions.noOrigin')
      : jumpsStatus === 'unknown'
        ? t('travel.incursions.unknownJumps')
        : null;

  return (
    <CollapsiblePanel
      title={t('travel.incursions.title')}
      meta={feed ? t('travel.incursions.count', { count: rows.length }) : undefined}
      expanded={open}
      onToggle={() => void useIncursionsPanelOpen.getState().setValue(!open)}
      labels={{ show: t('travel.incursions.show'), hide: t('travel.incursions.hide') }}
      collapsedSummary={
        <p className="text-xs text-text-dim">
          {nearest
            ? t('travel.incursions.nearest', {
                system: systemName(nearest.stagingSystemId),
                distance: jumpsText(nearest) ?? t('travel.incursions.distanceUnknown'),
              })
            : (status ?? '')}
        </p>
      }
    >
      <div ref={bodyRef} tabIndex={-1} className="space-y-2 text-xs focus:outline-none">
        <LiveStatus>{status ?? ''}</LiveStatus>
        {status !== null ? (
          <div className="flex items-center gap-2 text-text-dim">
            <p>{status}</p>
            {feed === null && (
              <Button
                size="sm"
                onClick={() => {
                  holdRetryFocus();
                  retry();
                }}
              >
                {t('common.retry')}
              </Button>
            )}
          </div>
        ) : (
          <>
            {originNote && <p className="text-text-dim">{originNote}</p>}
            <ul aria-label={t('travel.incursions.listLabel')} className="divide-y divide-line">
              {rows.map((row) => {
                const security = systems?.get(row.stagingSystemId)?.security;
                const action = routeAction(row.stagingSystemId);
                const distance = jumpsText(row);
                return (
                  <li key={row.constellationId} className="flex items-start gap-2 py-2">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold [overflow-wrap:anywhere]">
                          {systemName(row.stagingSystemId)}
                        </span>
                        {security !== undefined && <SecurityStatus security={security} />}
                        <span
                          className={cx(
                            'text-[0.6875rem] font-semibold tracking-wider uppercase',
                            INCURSION_STATE_TONE[row.state]
                          )}
                        >
                          {t(`travel.incursions.state.${row.state}`)}
                        </span>
                      </p>
                      <p className="text-text-dim">
                        {[
                          names.get(row.constellationId) ??
                            t('travel.incursions.constellation', { id: row.constellationId }),
                          t('travel.incursions.influence', {
                            percent: Math.round(row.influence * 100),
                          }),
                          t('travel.incursions.systems', { count: row.systemCount }),
                          row.hasBoss && t('travel.incursions.boss'),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {distance && <p className="tabular-nums">{distance}</p>}
                    </div>
                    {action === 'on-route' ? (
                      <span className="shrink-0 py-1 text-text-dim">
                        {t('travel.incursions.onRoute')}
                      </span>
                    ) : action === 'full' ? (
                      <Tooltip content={t('travel.incursions.stopsFull')}>
                        <Button
                          size="sm"
                          aria-disabled
                          className="shrink-0"
                          aria-label={t('travel.incursions.routeTo', {
                            system: systemName(row.stagingSystemId),
                          })}
                        >
                          {t('travel.incursions.route')}
                        </Button>
                      </Tooltip>
                    ) : (
                      <Button
                        size="sm"
                        className="shrink-0"
                        aria-label={t('travel.incursions.routeTo', {
                          system: systemName(row.stagingSystemId),
                        })}
                        onClick={() => onRoute(row.stagingSystemId)}
                      >
                        {t('travel.incursions.route')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-text-dim">
              <HintText content={t('travel.incursions.jumpBasisHint')}>
                {t('travel.incursions.jumpBasis')}
              </HintText>
            </p>
          </>
        )}
      </div>
    </CollapsiblePanel>
  );
}
