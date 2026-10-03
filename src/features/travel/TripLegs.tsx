/**
 * Route Safety's itinerary by Leg (issue #2475): a trip through several Stops,
 * one section per leg. Each header reads "Leg 1 · Sabusi → Jita · 11 j ·
 * lowest 0.5 · <chokepoints>"; the first leg opens and the others start
 * folded. Each open leg is its own `RouteSystemsTable`, so quiet stretches
 * fold between that leg's own ends.
 *
 * A leg no stargate route flies says so in place of its rows — the other legs
 * still draw.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui';
import type { RouteSafetyRow } from '@/engine/route/routeSafety';
import { RouteSystemsTable } from './RouteSystemsTable';
import type { RouteKillsCell } from './useRouteKills';
import type { RouteSafetyLeg } from './useRouteSafety';

export function TripLegs({
  legs,
  nameOf,
  killsOf,
  avoidAction,
}: {
  legs: readonly RouteSafetyLeg[];
  nameOf: (systemId: number) => string;
  killsOf: (systemId: number) => RouteKillsCell;
  avoidAction: (leg: RouteSafetyLeg, row: RouteSafetyRow) => (() => void) | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set([0]));
  const toggle = (index: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <ol aria-label={t('travel.legs.label')} className="divide-y divide-line border-y border-line">
      {legs.map((leg, index) => {
        const number = index + 1;
        const expanded = open.has(index);
        const parts = [
          t('travel.legs.leg', { number }),
          t('travel.legs.ends', { from: nameOf(leg.from), to: nameOf(leg.to) }),
        ];
        if (leg.summary) {
          parts.push(t('travel.legs.jumps', { count: leg.summary.jumps }));
          if (leg.summary.lowestSecurity !== null) {
            parts.push(
              t('travel.summary.lowest', { security: leg.summary.lowestSecurity.toFixed(1) })
            );
          }
          if (leg.summary.chokepoints.length > 0) {
            parts.push(
              t('travel.summary.chokepoints', { names: leg.summary.chokepoints.join(', ') })
            );
          }
        } else {
          parts.push(t('travel.legs.noRoute'));
        }
        return (
          <li key={`${index}-${leg.from}-${leg.to}`}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={parts.join(' · ')}
              onClick={() => toggle(index)}
              className="flex min-h-11 w-full items-center gap-1.5 py-1.5 text-left hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:min-h-0"
            >
              <Caret expanded={expanded} />
              <span className="flex flex-wrap gap-x-2">
                {parts.map((part, at) => (
                  <span key={at} className={at === 0 ? 'font-semibold' : 'text-text-dim'}>
                    {at > 0 && (
                      <span aria-hidden="true" className="mr-2 text-text-faint">
                        ·
                      </span>
                    )}
                    {part}
                  </span>
                ))}
              </span>
            </button>
            {expanded && (
              <div className="pb-3">
                {leg.rows ? (
                  <RouteSystemsTable
                    rows={leg.rows}
                    killsOf={killsOf}
                    avoidAction={(row) => avoidAction(leg, row)}
                    label={t('travel.legs.tableLabel', { number })}
                  />
                ) : (
                  <p className="text-text-dim">
                    {t('travel.legs.noRouteHint', { from: nameOf(leg.from), to: nameOf(leg.to) })}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
