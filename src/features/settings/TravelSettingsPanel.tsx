import { useTranslation } from 'react-i18next';
import {
  Disclosure,
  Field,
  Fields,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { ROUTE_PREFERENCE_LABEL_KEYS, ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import {
  useAvoidEdencom,
  useAvoidPodKills,
  useAvoidTriglavian,
  useDefaultRoutePreference,
  useRouteRules,
} from '@/features/route/routeRules';
import {
  AvoidRuleToggles,
  SecurityPenaltyInput,
  SecurityPenaltyNote,
} from '@/features/route/TravelRuleFields';
import { SavedRouteNetworkFields } from '@/features/travel/SavedRouteNetworkFields';
import { SettingsHint, SettingsPanelLoading } from './settingsFields';
import { AvoidedSystemsPanel } from './AvoidedSystemsPanel';
import { usePhoneFold } from './usePhoneFold';

export function TravelSettingsPanel() {
  const { t } = useTranslation();
  const preference = useDefaultRoutePreference((state) => state.value);
  const setPreference = useDefaultRoutePreference((state) => state.setValue);
  const { settingsHydrated: hydrated, podKillsUnavailable } = useRouteRules();
  const avoidFold = usePhoneFold();
  const edencom = useAvoidEdencom((state) => state.value);
  const triglavian = useAvoidTriglavian((state) => state.value);
  const podKills = useAvoidPodKills((state) => state.value);
  const rules = [edencom, triglavian, podKills && !podKillsUnavailable];
  const rulesOn = rules.filter(Boolean).length;

  return (
    <div className="space-y-4">
      {hydrated ? (
        <Panel title={t('settings.travel.routeTitle')}>
          <div className="space-y-4">
            <SettingsHint>{t('settings.travel.hint')}</SettingsHint>

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

              {avoidFold.phone ? (
                <Disclosure
                  label={t('settings.travel.avoidTitle')}
                  trailing={t('settings.travel.avoidSummary', {
                    count: rulesOn,
                    total: rules.length,
                  })}
                  expanded={avoidFold.expanded}
                  onToggle={avoidFold.toggle}
                >
                  <div className="space-y-2 p-2.5">
                    <SettingsHint>{t('settings.travel.avoidHint')}</SettingsHint>
                    <AvoidRuleToggles podKillsUnavailable={podKillsUnavailable} />
                  </div>
                </Disclosure>
              ) : (
                <Field
                  label={t('settings.travel.avoidTitle')}
                  note={t('settings.travel.avoidHint')}
                >
                  <AvoidRuleToggles podKillsUnavailable={podKillsUnavailable} />
                </Field>
              )}
            </Fields>
          </div>
        </Panel>
      ) : (
        <SettingsPanelLoading title={t('settings.travel.routeTitle')} />
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title={t('settings.travel.networkTitle')}>
          <div className="space-y-4">
            <SettingsHint>{t('settings.travel.networkHint')}</SettingsHint>
            <SavedRouteNetworkFields />
          </div>
        </Panel>
        <AvoidedSystemsPanel />
      </div>
    </div>
  );
}
