import { tappableRowClassName } from '@/components/ui/controlStyles';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, IconButton, LiveNote, LiveStatus, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { SecurityStatus } from '@/components/SecurityStatus';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { EDENCOM_SYSTEMS, TRIGLAVIAN_MINOR_VICTORY_SYSTEMS } from '@/engine/route/invasionSystems';
import { clampInt } from '@/features/industry/clampInt';
import { cx } from '@/lib/cx';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { addAvoidedSystem, removeAvoidedSystem, useAvoidedSystems } from './avoidedSystems';
import {
  MAX_POD_KILL_THRESHOLD,
  MAX_SECURITY_PENALTY,
  MIN_POD_KILL_THRESHOLD,
  MIN_SECURITY_PENALTY,
  useAvoidedSystemsEnabled,
  useAvoidEdencom,
  useAvoidPodKills,
  useAvoidTriglavian,
  usePodKillThreshold,
  useSecurityPenalty,
} from './routeRules';
import { SolarSystemPicker } from './SolarSystemPicker';
import { useSolarSystemList } from './useSolarSystems';

function clampedInt(raw: string, min: number, max: number): number | null {
  return raw.trim() === '' ? null : clampInt(Number(raw), min, max);
}

export function SecurityPenaltyNote({ preference }: { preference: RoutePreferenceKind }) {
  const { t } = useTranslation();
  return (
    <>
      {preference === 'shortest'
        ? t('settings.travel.penaltyShorterHint')
        : t('settings.travel.penaltyHint')}
    </>
  );
}

export function SecurityPenaltyInput({
  id,
  preference,
}: {
  id: string;
  preference: RoutePreferenceKind;
}) {
  const penalty = useSecurityPenalty((state) => state.value);
  const setPenalty = useSecurityPenalty((state) => state.setValue);
  return (
    <TextInput
      id={id}
      type="number"
      min={MIN_SECURITY_PENALTY}
      max={MAX_SECURITY_PENALTY}
      step={1}
      value={penalty}
      disabled={preference === 'shortest'}
      onChange={(event) => {
        const next = clampedInt(event.target.value, MIN_SECURITY_PENALTY, MAX_SECURITY_PENALTY);
        if (next !== null) void setPenalty(next);
      }}
      className="w-24"
    />
  );
}

export function AvoidRuleToggles({ podKillsUnavailable }: { podKillsUnavailable: boolean }) {
  const { t } = useTranslation();
  const avoidEdencom = useAvoidEdencom((state) => state.value);
  const setAvoidEdencom = useAvoidEdencom((state) => state.setValue);
  const avoidTriglavian = useAvoidTriglavian((state) => state.value);
  const setAvoidTriglavian = useAvoidTriglavian((state) => state.setValue);
  const avoidPodKills = useAvoidPodKills((state) => state.value);
  const setAvoidPodKills = useAvoidPodKills((state) => state.setValue);
  const podKillThreshold = usePodKillThreshold((state) => state.value);
  const setPodKillThreshold = usePodKillThreshold((state) => state.setValue);

  return (
    <div className="space-y-2">
      <label className={`flex items-center gap-2 text-xs ${tappableRowClassName}`}>
        <Checkbox checked={avoidEdencom} onChange={() => void setAvoidEdencom(!avoidEdencom)} />
        {t('settings.travel.avoidEdencom', { count: EDENCOM_SYSTEMS.length })}
      </label>
      <label className={`flex items-center gap-2 text-xs ${tappableRowClassName}`}>
        <Checkbox
          checked={avoidTriglavian}
          onChange={() => void setAvoidTriglavian(!avoidTriglavian)}
        />
        {t('settings.travel.avoidTriglavian', { count: TRIGLAVIAN_MINOR_VICTORY_SYSTEMS.length })}
      </label>
      <label className={`flex items-center gap-2 text-xs ${tappableRowClassName}`}>
        <Checkbox checked={avoidPodKills} onChange={() => void setAvoidPodKills(!avoidPodKills)} />
        {t('settings.travel.avoidPodKills')}
      </label>
      <div className="flex flex-wrap items-center gap-2 pl-6 text-xs">
        <span>{t('settings.travel.podKillsAtLeast')}</span>
        <TextInput
          type="number"
          className="w-16"
          min={MIN_POD_KILL_THRESHOLD}
          max={MAX_POD_KILL_THRESHOLD}
          step={1}
          value={podKillThreshold}
          disabled={!avoidPodKills}
          aria-label={t('settings.travel.podKillThresholdLabel')}
          onChange={(event) => {
            const next = clampedInt(
              event.target.value,
              MIN_POD_KILL_THRESHOLD,
              MAX_POD_KILL_THRESHOLD
            );
            if (next !== null) void setPodKillThreshold(next);
          }}
        />
        <span>{t('settings.travel.podKillsSuffix', { count: podKillThreshold })}</span>
      </div>
      {podKillsUnavailable && (
        <LiveNote className="text-xs text-warning">
          {t('settings.travel.podKillsUnavailable')}
        </LiveNote>
      )}
    </div>
  );
}

export function AvoidedSystemsEditor({
  narrow = false,
  switchLabel,
}: {
  narrow?: boolean;
  switchLabel?: string;
}) {
  const { t } = useTranslation();
  const avoided = useAvoidedSystems((state) => state.value);
  const setAvoided = useAvoidedSystems((state) => state.setValue);
  const enabled = useAvoidedSystemsEnabled((state) => state.value);
  const setEnabled = useAvoidedSystemsEnabled((state) => state.setValue);
  const hydrated = useHydratedStore(useAvoidedSystems, useAvoidedSystemsEnabled);

  const { systems, failed: systemsFailed, retry: retrySystems } = useSolarSystemList(true);
  const [sectionRef, , holdRetryFocus] = useRetryFocus(
    systemsFailed ? 'failed' : systems === null ? 'busy' : 'ok',
    'systems'
  );
  const byId = useMemo(() => new Map(systems?.map((s) => [s.id, s]) ?? []), [systems]);
  const exclude = useMemo(() => new Set(avoided), [avoided]);

  const rows = useMemo(
    () =>
      avoided
        .map((id) => ({ id, system: byId.get(id) }))
        .sort((a, b) => (a.system?.name ?? `#${a.id}`).localeCompare(b.system?.name ?? `#${b.id}`)),
    [avoided, byId]
  );

  const removeRefs = useRef(new Map<number, HTMLButtonElement>());
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const focusAfterCommit = useFocusAfterCommit();

  if (!hydrated) return null;

  return (
    <div ref={sectionRef} tabIndex={-1} className="space-y-3 focus:outline-none">
      <LiveStatus>{systemsFailed ? t('jumpRange.systemsFailed') : ''}</LiveStatus>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className={`flex items-center gap-2 text-xs font-semibold ${tappableRowClassName}`}>
          <Checkbox checked={enabled} onChange={() => void setEnabled(!enabled)} />
          {switchLabel ?? t('settings.avoidedSystems.enabled')}
        </label>
        <SolarSystemPicker
          value={null}
          onChange={(systemId) => void setAvoided(addAvoidedSystem(avoided, systemId))}
          ariaLabel={t('settings.avoidedSystems.addLabel')}
          triggerLabel={
            <span className="flex items-center gap-1.5">
              <Icon.AddRow size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {t('settings.avoidedSystems.add')}
            </span>
          }
          exclude={exclude}
          showSecurity
          triggerRef={addTriggerRef}
        />
      </div>
      {systemsFailed && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-warning">
          <span>{t('jumpRange.systemsFailed')}</span>
          <Button
            size="sm"
            onClick={() => {
              holdRetryFocus();
              retrySystems();
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-xs text-text-dim">{t('settings.avoidedSystems.empty')}</p>
      ) : (
        <ul
          aria-label={t('settings.avoidedSystems.title')}
          className={cx(
            'grid border-t border-line text-xs',
            !narrow && 'sm:grid-cols-2 sm:gap-x-6 xl:grid-cols-3'
          )}
        >
          {rows.map(({ id, system }, index) => {
            const name = system?.name ?? `#${id}`;
            return (
              <li key={id} className="flex items-center gap-2 border-b border-line px-2 py-1">
                <span className="flex-1 truncate">
                  {name}
                  {system && <SecurityStatus security={system.security} className="ml-1" />}
                </span>
                <IconButton
                  size="sm"
                  variant="plain"
                  icon={<Icon.Close />}
                  ref={(el) => {
                    if (el) removeRefs.current.set(id, el);
                    else removeRefs.current.delete(id);
                  }}
                  label={t('settings.avoidedSystems.remove', { name })}
                  onClick={() => {
                    const near = [rows[index + 1]?.id, rows[index - 1]?.id].map(
                      (key) => () => (key === undefined ? null : removeRefs.current.get(key))
                    );
                    focusAfterCommit(...near, addTriggerRef);
                    void setAvoided(removeAvoidedSystem(avoided, id));
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
