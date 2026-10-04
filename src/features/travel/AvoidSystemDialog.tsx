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
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Spinner } from '@/components/ui';
import {
  avoidListKey,
  avoidPreviewOutcome,
  listOnlyOutcome,
  type AvoidPreviewOutcome,
} from '@/engine/route/avoidRules';
import { addAvoidedSystem, useAvoidedSystems } from '@/features/route/avoidedSystems';
import { useAvoidedSystemsEnabled } from '@/features/route/routeRules';
import type { AvoidTripResult, RouteSafetyLeg, RouteSafetyState } from './useRouteSafety';

export interface AvoidTarget {
  systemId: number;
  name: string;
}

type AvoidPreview =
  ({ kind: 'preview' } & AvoidPreviewOutcome) | { kind: 'no-route' } | { kind: 'unknown' };

const legRows = (trip: { legs: readonly RouteSafetyLeg[] }) => trip.legs.map((leg) => leg.rows);

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
  onClose,
}: {
  /** `null` keeps the dialog closed. */
  target: AvoidTarget | null;
  /** The page's trip now, or `null` while it loads. */
  route: Extract<RouteSafetyState, { kind: 'route' }> | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const avoided = useAvoidedSystems((state) => state.value);
  const setAvoided = useAvoidedSystems((state) => state.setValue);
  const enabled = useAvoidedSystemsEnabled((state) => state.value);
  const setEnabled = useAvoidedSystemsEnabled((state) => state.setValue);
  const [planned, setPlanned] = useState<{ key: string; result: AvoidTripResult } | null>(null);

  const systemId = target?.systemId ?? null;
  // Keyed by what it plans, not by the planner's identity: a hole list
  // refreshed with the same holes is the same trip, and re-plans nothing.
  const previewKey =
    route === null || systemId === null
      ? null
      : `${route.requestKey}|${systemId}|${enabled}|${avoidListKey(avoided)}`;
  const latest = useRef({ route, systemId, avoided, enabled });
  useEffect(() => {
    latest.current = { route, systemId, avoided, enabled };
  });

  useEffect(() => {
    const {
      route: trip,
      systemId: id,
      avoided: avoidList,
      enabled: avoidListEnabled,
    } = latest.current;
    if (previewKey === null || trip === null || id === null) return;
    let cancelled = false;
    void trip
      .planWithAvoid({ systemId: id, avoidList, avoidListEnabled })
      // A failed plan says it can't be worked out, never spins for good.
      .catch((): AvoidTripResult => ({ kind: 'unknown' }))
      .then((result) => {
        if (!cancelled) setPlanned({ key: previewKey, result });
      });
    return () => {
      cancelled = true;
    };
  }, [previewKey]);

  if (target === null) return null;
  const next = route !== null && planned?.key === previewKey ? planned.result : null;
  const current: AvoidPreview | null =
    route === null || next === null
      ? null
      : next.kind === 'route'
        ? {
            kind: 'preview',
            ...avoidPreviewOutcome({
              current: legRows(route),
              next: legRows(next),
              systemId: target.systemId,
            }),
          }
        : next;

  const listOnly = route === null ? null : listOnlyOutcome(legRows(route));

  const add = (switchOn: boolean) => {
    void setAvoided(addAvoidedSystem(avoided, target.systemId));
    if (switchOn) void setEnabled(true);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={t('travel.avoid.title', { name: target.name })}>
      <div className="space-y-3 text-sm">
        {!enabled && <p>{t('travel.avoid.switchedOff')}</p>}
        {enabled ? (
          <>
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
              <Button variant="primary" onClick={() => add(false)}>
                {t('travel.avoid.confirm', { name: target.name })}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <div
                role="group"
                aria-label={t('travel.avoid.confirmSwitchOn')}
                className="space-y-2"
              >
                <div role="status" className="space-y-2">
                  {current === null ? (
                    <Spinner label={t('common.loading')} />
                  ) : (
                    <PreviewText preview={current} name={target.name} />
                  )}
                </div>
                <Button variant="primary" onClick={() => add(true)}>
                  {t('travel.avoid.confirmSwitchOn')}
                </Button>
              </div>
              <div role="group" aria-label={t('travel.avoid.addOnly')} className="space-y-2">
                {listOnly === null ? (
                  <Spinner label={t('common.loading')} />
                ) : (
                  <p className="font-semibold">
                    {t('travel.avoid.listOnlyUnchanged', {
                      count: listOnly.jumps,
                      delta: formatJumpDelta(listOnly.jumpDelta),
                    })}
                  </p>
                )}
                <Button onClick={() => add(false)}>{t('travel.avoid.addOnly')}</Button>
              </div>
            </div>
            <p className="text-text-dim">{t('travel.avoid.appWide', { name: target.name })}</p>
            <div className="flex justify-end pt-2">
              <Button onClick={onClose}>{t('common.cancel')}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
