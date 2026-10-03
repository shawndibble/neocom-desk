import { useTranslation } from 'react-i18next';
import {
  Field,
  Fields,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { ROUTE_PREFERENCE_LABEL_KEYS, ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import { useDefaultRoutePreference, useRouteRules } from '@/features/route/routeRules';
import {
  AvoidRuleToggles,
  SecurityPenaltyInput,
  SecurityPenaltyNote,
} from '@/features/route/TravelRuleFields';
import { AvoidedSystemsPanel } from './AvoidedSystemsPanel';

/**
 * Settings → Travel: the in-game autopilot's route options, for planning.
 * Every jump count in the app follows them (`features/route/routeRules.ts`);
 * a page with its own route picker starts from the preference here. Route
 * Safety edits the same settings in place, through the same controls
 * (`features/route/TravelRuleFields.tsx`).
 */
export function TravelSettingsPanel() {
  const { t } = useTranslation();
  const preference = useDefaultRoutePreference((state) => state.value);
  const setPreference = useDefaultRoutePreference((state) => state.setValue);
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
                note={<SecurityPenaltyNote preference={preference} />}
              >
                <SecurityPenaltyInput id="settings-security-penalty" preference={preference} />
              </Field>

              <Field label={t('settings.travel.avoidTitle')} note={t('settings.travel.avoidHint')}>
                <AvoidRuleToggles podKillsUnavailable={podKillsUnavailable} />
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
