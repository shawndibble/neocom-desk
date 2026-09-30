import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  TextInput,
} from '@/components/ui';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { EDENCOM_SYSTEMS, TRIGLAVIAN_MINOR_VICTORY_SYSTEMS } from '@/engine/route/invasionSystems';
import { ROUTE_PREFERENCE_LABEL_KEYS, ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import {
  MAX_POD_KILL_THRESHOLD,
  MAX_SECURITY_PENALTY,
  MIN_POD_KILL_THRESHOLD,
  MIN_SECURITY_PENALTY,
  ROUTE_RULE_STORES,
  useAvoidEdencom,
  useAvoidPodKills,
  useAvoidTriglavian,
  useDefaultRoutePreference,
  usePodKillThreshold,
  useRouteRules,
  useSecurityPenalty,
} from '@/features/route/routeRules';
import { AvoidedSystemsPanel } from './AvoidedSystemsPanel';

/** A whole number typed into a field, clamped to its range; `null` for an unreadable entry. */
function clampedInt(raw: string, min: number, max: number): number | null {
  const parsed = Math.round(Number(raw));
  if (raw.trim() === '' || !Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Settings → Travel: the in-game autopilot's route options, for planning.
 * Every jump count in the app follows them (`features/route/routeRules.ts`);
 * a page with its own route picker starts from the preference here.
 */
export function TravelSettingsPanel() {
  const { t } = useTranslation();
  const preference = useDefaultRoutePreference((state) => state.value);
  const setPreference = useDefaultRoutePreference((state) => state.setValue);
  const penalty = useSecurityPenalty((state) => state.value);
  const setPenalty = useSecurityPenalty((state) => state.setValue);
  const avoidEdencom = useAvoidEdencom((state) => state.value);
  const setAvoidEdencom = useAvoidEdencom((state) => state.setValue);
  const avoidTriglavian = useAvoidTriglavian((state) => state.value);
  const setAvoidTriglavian = useAvoidTriglavian((state) => state.setValue);
  const avoidPodKills = useAvoidPodKills((state) => state.value);
  const setAvoidPodKills = useAvoidPodKills((state) => state.setValue);
  const podKillThreshold = usePodKillThreshold((state) => state.value);
  const setPodKillThreshold = usePodKillThreshold((state) => state.setValue);
  // The form waits for the settings only: a kill feed still loading must not blank it.
  const { settingsHydrated: hydrated, podKillsUnavailable } = useRouteRules();
  useEffect(() => {
    for (const store of ROUTE_RULE_STORES) void store.getState().hydrate();
  }, []);

  return (
    <div className="space-y-4">
      <Panel title={t('settings.travel.routeTitle')}>
        {hydrated ? (
          <div className="max-w-md space-y-4">
            <p className="text-xs text-text-dim">{t('settings.travel.hint')}</p>

            <div className="space-y-1.5">
              <label htmlFor="settings-route-preference" className="block text-xs font-semibold">
                {t('settings.travel.preferenceLabel')}
              </label>
              <p className="text-xs text-text-dim">{t('settings.travel.preferenceHint')}</p>
              <Select
                value={preference}
                onValueChange={(value) => void setPreference(value as RoutePreferenceKind)}
              >
                <SelectTrigger
                  id="settings-route-preference"
                  aria-label={t('settings.travel.preferenceLabel')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUTE_PREFERENCES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(ROUTE_PREFERENCE_LABEL_KEYS[option])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 border-t border-line pt-3">
              <label htmlFor="settings-security-penalty" className="block text-xs font-semibold">
                {t('settings.travel.penaltyLabel')}
              </label>
              <p className="text-xs text-text-dim">
                {preference === 'shortest'
                  ? t('settings.travel.penaltyShorterHint')
                  : t('settings.travel.penaltyHint')}
              </p>
              <TextInput
                id="settings-security-penalty"
                type="number"
                min={MIN_SECURITY_PENALTY}
                max={MAX_SECURITY_PENALTY}
                step={1}
                value={penalty}
                disabled={preference === 'shortest'}
                onChange={(event) => {
                  const next = clampedInt(
                    event.target.value,
                    MIN_SECURITY_PENALTY,
                    MAX_SECURITY_PENALTY
                  );
                  if (next !== null) void setPenalty(next);
                }}
              />
            </div>

            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-xs font-semibold">{t('settings.travel.avoidTitle')}</p>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={avoidEdencom}
                  onChange={() => void setAvoidEdencom(!avoidEdencom)}
                />
                {t('settings.travel.avoidEdencom', { count: EDENCOM_SYSTEMS.length })}
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={avoidTriglavian}
                  onChange={() => void setAvoidTriglavian(!avoidTriglavian)}
                />
                {t('settings.travel.avoidTriglavian', {
                  count: TRIGLAVIAN_MINOR_VICTORY_SYSTEMS.length,
                })}
              </label>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={avoidPodKills}
                    onChange={() => void setAvoidPodKills(!avoidPodKills)}
                  />
                  {t('settings.travel.avoidPodKills')}
                </label>
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
              <p className="text-xs text-text-dim">{t('settings.travel.avoidHint')}</p>
              {podKillsUnavailable && (
                <p role="status" className="text-xs text-warning">
                  {t('settings.travel.podKillsUnavailable')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <Spinner />
        )}
      </Panel>
      <AvoidedSystemsPanel />
    </div>
  );
}
