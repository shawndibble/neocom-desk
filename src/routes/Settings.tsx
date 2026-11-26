import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { HELP_TABS, SETTINGS_TABS } from '@/app/pageTabs';
import { useIsPageIndex, usePageTab } from '@/lib/usePageTab';
import { tabPath } from '@/lib/pageTabs';
import {
  settingsSectionLabelKey,
  visibleSettingsGroups,
  type SettingsGroup,
} from '@/features/settings/sections';
import { SettingsBackLink, SettingsIndex, SettingsNav } from '@/features/settings/SettingsNav';
import { AnalyticsPanel } from '@/features/settings/AnalyticsPanel';
import { DevicePanel } from '@/features/settings/DevicePanel';
import { OfflineDataPanel } from '@/features/settings/OfflineDataPanel';
import { UpdatePanel } from '@/features/settings/UpdatePanel';
import { checkForUpdate } from '@/app/updateAvailable';
import { checkStorageAtRisk } from '@/features/settings/storageAtRisk';
import { InstallAppPanel } from '@/features/settings/InstallAppPanel';
import { TravelSettingsPanel } from '@/features/settings/TravelSettingsPanel';
import {
  CheckboxField,
  ChipRow,
  SegmentedRow,
  SettingsScopeHint,
} from '@/features/settings/settingsFields';
import { ActivityLogPanel } from '@/features/settings/ActivityLogPanel';
import { DataAgePanel } from '@/features/settings/DataAgePanel';
import { ExportPanel } from '@/features/settings/ExportPanel';
import { ImportPanel } from '@/features/settings/ImportPanel';
import { DataPanel } from '@/features/settings/DataPanel';
import { MobileTabsPanel } from '@/features/settings/MobileTabsPanel';
import { IndustryDefaultsPanel } from '@/features/settings/IndustryDefaultsPanel';
import { BpcSourcingDefaultsPanel } from '@/features/settings/BpcSourcingDefaultsPanel';
import { PiDefaultsPanel } from '@/features/settings/PiDefaultsPanel';
import { MarketDefaultsPanel } from '@/features/settings/MarketDefaultsPanel';
import { MiningTaxDefaultsPanel } from '@/features/settings/MiningTaxDefaultsPanel';
import { CharacterDefaultsPanel } from '@/features/settings/CharacterDefaultsPanel';
import { CorpDefaultsPanel } from '@/features/settings/CorpDefaultsPanel';
import { FONT_SCALE_LABEL_KEYS } from '@/features/settings/fontScaleLabelKeys';
import { usePhoneSummaries } from '@/features/settings/usePhoneSummaries';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { Field, Fields, FilterChip, PageHeader, Panel } from '@/components/ui';
import { useFontScale, FONT_SCALE_STEPS } from '@/lib/fontScale';
import { useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';
import { NUMBER_FORMATS, useNumberFormat } from '@/lib/numberFormat';
import { numberFormatExample } from '@/lib/numberLocale';
import { useTimeFormat, TIME_FORMATS } from '@/lib/timeFormat';
import {
  useCalendarWeekStart,
  CALENDAR_WEEK_START_DAYS,
} from '@/features/character/calendarWeekStart';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { NotificationsPanel } from '@/features/notifications/NotificationsPanel';
import { CharacterPermissionStrip } from '@/features/permissions/CharacterPermissionStrip';
import { PermissionsPanel } from '@/features/permissions/PermissionsPanel';

const LEGACY_HASH_TARGETS: Readonly<Record<string, string>> = {
  '#shortcuts': tabPath(HELP_TABS, 'shortcuts'),
  '#corp-access': tabPath(SETTINGS_TABS, 'permissions'),
};

function PhoneSettingsIndex({ groups }: { groups: readonly SettingsGroup[] }) {
  const summaries = usePhoneSummaries();
  return <SettingsIndex groups={groups} summaries={summaries} />;
}

export function Settings() {
  const { t } = useTranslation();
  const scale = useFontScale((state) => state.value);
  const setScale = useFontScale((state) => state.setValue);
  const timeFormat = useTimeFormat((state) => state.value);
  const isNarrow = useIsNarrow();
  const setTimeFormat = useTimeFormat((state) => state.setValue);
  const numberFormat = useNumberFormat((state) => state.value);
  const setNumberFormat = useNumberFormat((state) => state.setValue);
  const weekStart = useCalendarWeekStart((state) => state.value);
  const setWeekStart = useCalendarWeekStart((state) => state.setValue);
  const weekStartHydrated = useHydratedStore(useCalendarWeekStart);
  const singleKeyShortcuts = useSingleKeyShortcuts((state) => state.value);
  const setSingleKeyShortcuts = useSingleKeyShortcuts((state) => state.setValue);
  const singleKeyShortcutsHydrated = useHydratedStore(useSingleKeyShortcuts);
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [section] = usePageTab(SETTINGS_TABS);
  const isIndex = useIsPageIndex(SETTINGS_TABS) && !Object.hasOwn(LEGACY_HASH_TARGETS, hash);
  const corpAccess = useCorpAccess();
  const groups = useMemo(
    () => visibleSettingsGroups({ corp: corpAccess.state === 'ready' }),
    [corpAccess.state]
  );

  useEffect(() => {
    void checkForUpdate();
    void checkStorageAtRisk();
  }, []);

  useEffect(() => {
    if (!Object.hasOwn(LEGACY_HASH_TARGETS, hash)) return;
    navigate({ pathname: LEGACY_HASH_TARGETS[hash] }, { replace: true });
  }, [hash, navigate]);

  if (isIndex) {
    return (
      <div className="mx-auto max-w-page space-y-4">
        <PageHeader title={t('settings.title')} />
        <PhoneSettingsIndex groups={groups} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader
        title={t('settings.title')}
        meta={<span className="text-sm text-text-dim">{t(settingsSectionLabelKey(section))}</span>}
        actions={<SettingsBackLink />}
      />
      <div className="space-y-4 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:gap-6 md:space-y-0">
        <SettingsNav groups={groups} value={section} />
        <div className="min-w-0 space-y-4" data-settings-section={section}>
          {section === 'display' && (
            <>
              <Panel>
                <div className="space-y-4">
                  <SettingsScopeHint scope="device" />
                  <Fields variant="form">
                    <Field label={t('settings.fontScaleLabel')} note={t('settings.fontScaleHint')}>
                      <div
                        role="group"
                        aria-label={t('settings.fontScaleLabel')}
                        className="flex flex-wrap gap-2"
                      >
                        {FONT_SCALE_STEPS.map((step) => (
                          <FilterChip
                            key={step}
                            label={t(FONT_SCALE_LABEL_KEYS[step])}
                            selected={scale === step}
                            onToggle={() => void setScale(step)}
                          />
                        ))}
                      </div>
                    </Field>
                    <SegmentedRow
                      label={t('settings.timeFormatLabel')}
                      hint={t('settings.timeFormatHint')}
                      options={TIME_FORMATS}
                      selected={timeFormat}
                      onSelect={(format) => void setTimeFormat(format)}
                      labelFor={(format) => t(`settings.timeFormat.${format}`)}
                    />
                    <ChipRow
                      label={t('settings.numberFormatLabel')}
                      hint={t('settings.numberFormatHint')}
                      options={NUMBER_FORMATS}
                      selected={numberFormat}
                      onSelect={(format) => void setNumberFormat(format)}
                      labelFor={(format) =>
                        t(`settings.numberFormat.${format}`, {
                          example: numberFormatExample(format),
                        })
                      }
                    />
                    {weekStartHydrated && (
                      <SegmentedRow
                        label={t('settings.weekStartLabel')}
                        hint={t('settings.weekStartHint')}
                        options={CALENDAR_WEEK_START_DAYS}
                        selected={weekStart}
                        onSelect={(day) => void setWeekStart(day)}
                        labelFor={(day) => t(`settings.weekStart.${day}`)}
                      />
                    )}
                    {singleKeyShortcutsHydrated && (
                      <CheckboxField
                        id="settings-single-key-shortcuts"
                        label={t('settings.singleKeyShortcutsLabel')}
                        hint={t(
                          singleKeyShortcuts
                            ? 'settings.singleKeyShortcutsHint'
                            : 'settings.singleKeyShortcutsOffNote'
                        )}
                        checked={singleKeyShortcuts}
                        onChange={() => void setSingleKeyShortcuts(!singleKeyShortcuts)}
                      />
                    )}
                  </Fields>
                </div>
              </Panel>
              {isNarrow && <MobileTabsPanel />}
            </>
          )}
          {section === 'permissions' && (
            <>
              <CharacterPermissionStrip />
              <PermissionsPanel />
            </>
          )}
          {section === 'industry' && (
            <>
              <IndustryDefaultsPanel />
              <BpcSourcingDefaultsPanel />
            </>
          )}
          {section === 'pi' && <PiDefaultsPanel />}
          {section === 'market' && <MarketDefaultsPanel />}
          {section === 'miningTax' && <MiningTaxDefaultsPanel />}
          {section === 'characters' && <CharacterDefaultsPanel />}
          {section === 'corporation' && <CorpDefaultsPanel />}
          {section === 'travel' && <TravelSettingsPanel />}
          {section === 'notifications' && <NotificationsPanel />}
          {section === 'app' && (
            <>
              <UpdatePanel />
              <InstallAppPanel />
              <ExportPanel />
              <ImportPanel />
              <AnalyticsPanel />
            </>
          )}
          {section === 'device' && <DevicePanel />}
          {section === 'dataAge' && (
            <>
              <DataPanel />
              <DataAgePanel />
            </>
          )}
          {section === 'offline' && <OfflineDataPanel />}
          {section === 'activity' && <ActivityLogPanel />}
        </div>
      </div>
    </div>
  );
}
