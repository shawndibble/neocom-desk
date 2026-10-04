/**
 * Avoid a system from its Route Safety row (issue #2472). The dialog previews
 * the route with the system avoided before anything is saved
 * (`./avoidPreview.ts`), then adds it to the pilot's Avoided Systems — a
 * Travel Setting, so it says the change reaches every jump count in the app.
 *
 * With the Avoided Systems switch off, the list does nothing to routes, so
 * the preview counts it switched on and the dialog offers to switch it on
 * along with the add.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Spinner } from '@/components/ui';
import { avoidListKey } from '@/engine/route/avoidRules';
import { addAvoidedSystem, useAvoidedSystems } from '@/features/route/avoidedSystems';
import { useAvoidedSystemsEnabled, type RouteRules } from '@/features/route/routeRules';
import type { RouteGraphExtras } from '@/features/route/localRoute';
import { previewAvoid, type AvoidPreviewResult } from './avoidPreview';

export interface AvoidTarget {
  systemId: number;
  name: string;
}

/** "+3", "−2", "+0": the change always carries a sign, so +0 reads as no change. */
function formatJumpDelta(delta: number): string {
  if (delta < 0) return `−${Math.abs(delta).toLocaleString()}`;
  return `+${delta.toLocaleString()}`;
}

function PreviewText({ preview, name }: { preview: AvoidPreviewResult; name: string }) {
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
  fromId,
  toId,
  rules,
  currentJumps,
  extras,
  extrasKey = '',
  onClose,
}: {
  /** `null` keeps the dialog closed. */
  target: AvoidTarget | null;
  fromId: number;
  toId: number;
  /** The rules the page's route is drawn with now. */
  rules: RouteRules;
  currentJumps: number;
  /** The holes the page's route may cross (issue #2476); stable while `extrasKey` is. */
  extras?: RouteGraphExtras;
  extrasKey?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const avoided = useAvoidedSystems((state) => state.value);
  const setAvoided = useAvoidedSystems((state) => state.setValue);
  const enabled = useAvoidedSystemsEnabled((state) => state.value);
  const setEnabled = useAvoidedSystemsEnabled((state) => state.setValue);
  const [preview, setPreview] = useState<{
    key: string;
    result: AvoidPreviewResult;
  } | null>(null);

  const systemId = target?.systemId ?? null;
  const requestKey = [
    systemId,
    fromId,
    toId,
    currentJumps,
    rules.preference,
    rules.securityPenalty,
    avoidListKey(rules.avoid),
    enabled,
    avoidListKey(avoided),
    extrasKey,
  ].join(':');

  useEffect(() => {
    if (systemId === null) return;
    let cancelled = false;
    void previewAvoid({
      fromId,
      toId,
      rules,
      systemId,
      currentJumps,
      avoidList: avoided,
      avoidListEnabled: enabled,
      extras,
    }).then((result) => {
      if (!cancelled) setPreview({ key: requestKey, result });
    });
    return () => {
      cancelled = true;
    };
  }, [systemId, fromId, toId, rules, currentJumps, avoided, enabled, extras, requestKey]);

  if (target === null) return null;
  const current = preview?.key === requestKey ? preview.result : null;

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
