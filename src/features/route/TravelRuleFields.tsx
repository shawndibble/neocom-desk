/**
 * The **Travel Settings** controls both Settings → Travel and Route Safety's
 * Route rules panel draw (issue #2472) — one set of components on one set of
 * synced stores, so the two places cannot drift apart or hold copies.
 *
 * Each host lays them out its own way and waits for the settings to hydrate
 * before showing them: a click on a default not yet replaced by the stored
 * value would write that default over it.
 */
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, IconButton, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { SecurityStatus } from '@/components/SecurityStatus';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { EDENCOM_SYSTEMS, TRIGLAVIAN_MINOR_VICTORY_SYSTEMS } from '@/engine/route/invasionSystems';
import { clampInt } from '@/features/industry/clampInt';
import { cx } from '@/lib/cx';
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
import { useSolarSystems } from './useSolarSystems';

/** A whole number typed into a field, clamped to its range; `null` for an unreadable entry. */
function clampedInt(raw: string, min: number, max: number): number | null {
  // A cleared field leaves the setting alone rather than snapping it to `min`.
  return raw.trim() === '' ? null : clampInt(Number(raw), min, max);
}

/** The note under the penalty: Prefer shorter counts jumps only, so it does not apply. */
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

/**
 * The security penalty, off under Prefer shorter. `preference` is the one the
 * host routes with — the saved default in Settings, the page's own on Route
 * Safety — so the input never reads the default behind a page's back.
 */
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

/** EDENCOM, Triglavian and recent pod kills: the avoid rules beyond the pilot's own list. */
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
      <label className="flex items-center gap-2 text-xs">
        <Checkbox checked={avoidEdencom} onChange={() => void setAvoidEdencom(!avoidEdencom)} />
        {t('settings.travel.avoidEdencom', { count: EDENCOM_SYSTEMS.length })}
      </label>
      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={avoidTriglavian}
          onChange={() => void setAvoidTriglavian(!avoidTriglavian)}
        />
        {t('settings.travel.avoidTriglavian', { count: TRIGLAVIAN_MINOR_VICTORY_SYSTEMS.length })}
      </label>
      <label className="flex items-center gap-2 text-xs">
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
        <p role="status" className="text-xs text-warning">
          {t('settings.travel.podKillsUnavailable')}
        </p>
      )}
    </div>
  );
}

/**
 * The pilot's **Avoided Systems**: the switch, an add through the local
 * solar-system search, and one row per system to remove it. Each row shows the
 * system's security the way every other system mention in the app does.
 *
 * `narrow` is for a side column: the picker under the switch and the list in
 * one column. `switchLabel` replaces the switch's own wording.
 */
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
  const hydrated = useAvoidedSystems((state) => state.hydrated);
  const hydrate = useAvoidedSystems((state) => state.hydrate);
  const enabled = useAvoidedSystemsEnabled((state) => state.value);
  const setEnabled = useAvoidedSystemsEnabled((state) => state.setValue);
  const enabledHydrated = useAvoidedSystemsEnabled((state) => state.hydrated);
  const hydrateEnabled = useAvoidedSystemsEnabled((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
    void hydrateEnabled();
  }, [hydrate, hydrateEnabled]);

  const systems = useSolarSystems(true);
  const byId = useMemo(() => new Map(systems?.map((s) => [s.id, s]) ?? []), [systems]);
  const exclude = useMemo(() => new Set(avoided), [avoided]);

  // A system the snapshot cannot name still lists, as `#id`, so it can be removed.
  const rows = useMemo(
    () =>
      avoided
        .map((id) => ({ id, system: byId.get(id) }))
        .sort((a, b) => (a.system?.name ?? `#${a.id}`).localeCompare(b.system?.name ?? `#${b.id}`)),
    [avoided, byId]
  );

  if (!hydrated || !enabledHydrated) return null;

  return (
    <div className="space-y-3">
      <div
        className={cx(
          'flex flex-wrap gap-x-6 gap-y-3',
          narrow ? 'flex-col items-start' : 'items-center justify-between'
        )}
      >
        {/* Off routes straight through the list without the pilot losing it. */}
        <label className="flex items-center gap-2 text-xs font-semibold">
          <Checkbox checked={enabled} onChange={() => void setEnabled(!enabled)} />
          {switchLabel ?? t('settings.avoidedSystems.enabled')}
        </label>
        <SolarSystemPicker
          value={null}
          onChange={(systemId) => void setAvoided(addAvoidedSystem(avoided, systemId))}
          ariaLabel={t('settings.avoidedSystems.add')}
          triggerLabel={
            <span className="flex items-center gap-1.5">
              <Icon.AddRow size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {t('settings.avoidedSystems.add')}
            </span>
          }
          exclude={exclude}
          showSecurity
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-text-dim">{t('settings.avoidedSystems.empty')}</p>
      ) : (
        // Columns rather than one long strip: the names are short and the list can run long.
        <ul
          aria-label={t('settings.avoidedSystems.title')}
          className={cx(
            'grid border-t border-line text-xs',
            !narrow && 'sm:grid-cols-2 sm:gap-x-6 xl:grid-cols-3'
          )}
        >
          {rows.map(({ id, system }) => {
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
                  label={t('settings.avoidedSystems.remove', { name })}
                  onClick={() => void setAvoided(removeAvoidedSystem(avoided, id))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
