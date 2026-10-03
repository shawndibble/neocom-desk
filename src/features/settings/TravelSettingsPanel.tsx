import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  Field,
  Fields,
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
  useAvoidEdencom,
  useAvoidPodKills,
  useAvoidTriglavian,
  useDefaultRoutePreference,
  usePodKillThreshold,
  useRouteRules,
  useSecurityPenalty,
} from '@/features/route/routeRules';
import { clampInt } from '@/features/industry/clampInt';
import { AvoidedSystemsPanel } from './AvoidedSystemsPanel';

/** A whole number typed into a field, clamped to its range; `null` for an unreadable entry. */
function clampedInt(raw: string, min: number, max: number): number | null {
  // A cleared field leaves the setting alone rather than snapping it to `min`.
  return raw.trim() === '' ? null : clampInt(Number(raw), min, max);
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

  return (
    <div className="space-y-4">
      <Panel title={t('settings.travel.routeTitle')}>
        {hydrated ? (
          <div className="space-y-4">
            <p className="max-w-2xl text-xs text-text-dim">{t('settings.travel.hint')}</p>

            <Fields variant="form">
              <Field
                label={t('settings.travel.preferenceLabel')}
                htmlFor="settings-route-preference"
                note={t('settings.travel.preferenceHint')}
              >
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
              </Field>

              <Field
                label={t('settings.travel.penaltyLabel')}
                htmlFor="settings-security-penalty"
                note={
                  preference === 'shortest'
                    ? t('settings.travel.penaltyShorterHint')
                    : t('settings.travel.penaltyHint')
                }
              >
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
                  className="w-24"
                />
              </Field>

              <Field label={t('settings.travel.avoidTitle')} note={t('settings.travel.avoidHint')}>
                <div className="space-y-2">
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
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={avoidPodKills}
                      onChange={() => void setAvoidPodKills(!avoidPodKills)}
                    />
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
              </Field>
            </Fields>
          </div>
        ) : (
          <Spinner />
        )}
      </Panel>
      <AvoidedSystemsPanel />
    </div>
  );
}
