/**
 * Avoid a system from its Route Safety row (issue #2472). The dialog previews
 * the trip with the system avoided before anything is saved, then adds it to
 * the pilot's Avoided Systems — a Travel Setting, so it says the change
 * reaches every jump count in the app.
 *
 * The preview is the page's own trip request with one more Avoid (issue
 * #2547): the same planner and assembly, pins, holes, bridges and Optimize
 * included (`useRouteSafety`'s `planWithAvoid`). Its change is the whole
 * trip's jumps, new less current, so a stop order that moves elsewhere in the
 * trip is counted too.
 *
 * With the Avoided Systems switch off, the list does nothing to routes, so
 * the preview counts it switched on and the dialog offers to switch it on
 * along with the add.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Spinner } from '@/components/ui';
import { avoidListKey, candidateAvoid } from '@/engine/route/avoidRules';
import type { RouteSafetyAssembly } from '@/engine/route/routeSafetyTrip';
import { addAvoidedSystem, useAvoidedSystems } from '@/features/route/avoidedSystems';
import { useAvoidedSystemsEnabled } from '@/features/route/routeRules';
import type { AvoidTripResult, RouteSafetyState } from './useRouteSafety';

export interface AvoidTarget {
  systemId: number;
  name: string;
}

type RoutedTrip = Extract<RouteSafetyAssembly, { kind: 'route' }>;

/** The figures a preview compares: the whole trip's, or its routed legs' while a leg has none. */
function tripFigures(trip: RoutedTrip): { jumps: number; lowestSecurity: number | null } {
  if (trip.trip) return trip.trip.summary;
  let jumps = 0;
  let lowestSecurity: number | null = null;
  for (const { summary } of trip.legs) {
    if (!summary) continue;
    jumps += summary.jumps;
    if (summary.lowestSecurity !== null) {
      lowestSecurity = Math.min(lowestSecurity ?? Infinity, summary.lowestSecurity);
    }
  }
  return { jumps, lowestSecurity };
}

type AvoidPreview =
  | {
      kind: 'preview';
      jumps: number;
      /** New jumps less current: 0 either way, or negative with other rules changing. */
      jumpDelta: number;
      lowestSecurity: number | null;
      /**
       * The new trip still passes through the system. Avoidance is a cost,
       * never a wall, so a trip only possible through it keeps it — told
       * apart from an equal-length detour, which is +0 too.
       */
      stillCrosses: boolean;
    }
  | { kind: 'no-route' }
  | { kind: 'unknown' };

function avoidPreview(current: RoutedTrip, next: AvoidTripResult, systemId: number): AvoidPreview {
  if (next.kind !== 'route') return next;
  const { jumps, lowestSecurity } = tripFigures(next);
  return {
    kind: 'preview',
    jumps,
    jumpDelta: jumps - tripFigures(current).jumps,
    lowestSecurity,
    stillCrosses: next.legs.some((leg) => leg.rows?.some((row) => row.systemId === systemId)),
  };
}

/** "+3", "−2", "+0": the change always carries a sign, so +0 reads as no change. */
function formatJumpDelta(delta: number): string {
  if (delta < 0) return `−${Math.abs(delta).toLocaleString()}`;
  return `+${delta.toLocaleString()}`;
}

function PreviewText({ preview, name }: { preview: AvoidPreview; name: string }) {
  const { t } = useTranslation();
  if (preview.kind === 'no-route') return <p>{t('travel.avoid.noRoute', { name })}</p>;
  if (preview.kind === 'unknown') return <p>{t('travel.avoid.unknown', { name })}</p>;
  const delta = formatJumpDelta(preview.jumpDelta);
  return (
    <>
      <p className="font-semibold">
        {preview.lowestSecurity === null
          ? t('travel.avoid.becomes', { count: preview.jumps, delta })
          : t('travel.avoid.becomesLowest', {
              count: preview.jumps,
              delta,
              security: preview.lowestSecurity.toFixed(1),
            })}
      </p>
      {preview.stillCrosses && <p>{t('travel.avoid.noWayAround', { name })}</p>}
    </>
  );
}

export function AvoidSystemDialog({
  target,
  route,
  effectiveAvoid,
  onClose,
}: {
  /** `null` keeps the dialog closed. */
  target: AvoidTarget | null;
  /** The page's trip now, or `null` while it loads. */
  route: Extract<RouteSafetyState, { kind: 'route' }> | null;
  /** The avoid list the page's trip is drawn with now. */
  effectiveAvoid: readonly number[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const avoided = useAvoidedSystems((state) => state.value);
  const setAvoided = useAvoidedSystems((state) => state.setValue);
  const enabled = useAvoidedSystemsEnabled((state) => state.value);
  const setEnabled = useAvoidedSystemsEnabled((state) => state.setValue);
  const [planned, setPlanned] = useState<{
    plan: Extract<RouteSafetyState, { kind: 'route' }>['planWithAvoid'];
    avoidKey: string;
    result: AvoidTripResult;
  } | null>(null);

  const systemId = target?.systemId ?? null;
  const plan = route?.planWithAvoid ?? null;
  // What the preview was planned with, so a stale answer is never shown.
  const avoidKey =
    systemId === null
      ? ''
      : avoidListKey(
          candidateAvoid({
            effective: effectiveAvoid,
            systemId,
            avoidList: avoided,
            avoidListEnabled: enabled,
          })
        );

  useEffect(() => {
    if (plan === null || systemId === null) return;
    let cancelled = false;
    const avoid = candidateAvoid({
      effective: effectiveAvoid,
      systemId,
      avoidList: avoided,
      avoidListEnabled: enabled,
    });
    void plan(avoid).then((result) => {
      if (!cancelled) setPlanned({ plan, avoidKey: avoidListKey(avoid), result });
    });
    return () => {
      cancelled = true;
    };
  }, [plan, systemId, effectiveAvoid, avoided, enabled]);

  if (target === null) return null;
  const current =
    route !== null && planned?.plan === plan && planned.avoidKey === avoidKey
      ? avoidPreview(route, planned.result, target.systemId)
      : null;

  const add = (switchOn: boolean) => {
    void setAvoided(addAvoidedSystem(avoided, target.systemId));
    if (switchOn) void setEnabled(true);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={t('travel.avoid.title', { name: target.name })}>
      <div className="space-y-3 text-sm">
        {!enabled && <p>{t('travel.avoid.switchedOff')}</p>}
        <div role="status" className="space-y-2">
          {current === null ? (
            <Spinner label={t('common.loading')} />
          ) : (
            <PreviewText preview={current} name={target.name} />
          )}
        </div>
        <p className="text-text-dim">{t('travel.avoid.appWide', { name: target.name })}</p>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {enabled ? (
            <Button variant="primary" onClick={() => add(false)}>
              {t('travel.avoid.confirm', { name: target.name })}
            </Button>
          ) : (
            <>
              <Button onClick={() => add(false)}>{t('travel.avoid.addOnly')}</Button>
              <Button variant="primary" onClick={() => add(true)}>
                {t('travel.avoid.confirmSwitchOn')}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
