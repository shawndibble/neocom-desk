import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { HELP_TABS, SETTINGS_TABS } from '@/app/pageTabs';
import { useIsPageIndex, usePageTab } from '@/lib/usePageTab';
import { tabPath } from '@/lib/pageTabs';
import { visibleSettingsGroups, type SettingsGroup } from '@/features/settings/sections';
import { SettingsBackLink, SettingsIndex, SettingsNav } from '@/features/settings/SettingsNav';
import { AnalyticsPanel } from '@/features/settings/AnalyticsPanel';
import { DevicePanel } from '@/features/settings/DevicePanel';
import { OfflineDataPanel } from '@/features/settings/OfflineDataPanel';
import { UpdatePanel } from '@/features/settings/UpdatePanel';
import { InstallAppPanel } from '@/features/settings/InstallAppPanel';
import { TravelSettingsPanel } from '@/features/settings/TravelSettingsPanel';
import { ChipRow } from '@/features/settings/settingsFields';
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
import { Checkbox, Field, Fields, FilterChip, PageHeader, Panel } from '@/components/ui';
import { useFontScale, FONT_SCALE_STEPS } from '@/lib/fontScale';
import { useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';
import { useTimeFormat, TIME_FORMATS } from '@/lib/timeFormat';
import {
  useCalendarWeekStart,
  CALENDAR_WEEK_START_DAYS,
} from '@/features/character/calendarWeekStart';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { NotificationsPanel } from '@/features/notifications/NotificationsPanel';
import { PermissionsPanel } from '@/features/permissions/PermissionsPanel';

/**
 * Links that predate the sectioned page: the `?` shortcut and the corp prompt
 * pointed at an anchor on the old General tab. A bookmark of either still
 * lands on the default section (`TabRoute` drops an unknown segment but keeps
 * the hash), and this is what carries it on to where the anchor's content now
 * lives.
 */
const LEGACY_HASH_TARGETS: Readonly<Record<string, string>> = {
  // Shortcuts left Settings for Help (scope decision
  // `20261002-165816-shortcuts-move-to-help-always-on-and-lose`).
  '#shortcuts': tabPath(HELP_TABS, 'shortcuts'),
  '#corp-access': tabPath(SETTINGS_TABS, 'permissions'),
};

/** `/settings` on a phone: the grouped list of sections. */
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
  const weekStart = useCalendarWeekStart((state) => state.value);
  const setWeekStart = useCalendarWeekStart((state) => state.setValue);
  // Unlike `fontScale`/`timeFormat`, `App.tsx` does not hydrate this store for
  // the whole shell — it is otherwise only read from within `Calendar.tsx`
  // after that page's own `hydrate()` — so a cold load straight to `/settings`
  // needs its own hydrate here too, or the chip would paint the default until
  // Calendar happened to be visited (see `useHydratedStore`'s doc comment).
  const weekStartHydrated = useHydratedStore(useCalendarWeekStart);
  const singleKeyShortcuts = useSingleKeyShortcuts((state) => state.value);
  const setSingleKeyShortcuts = useSingleKeyShortcuts((state) => state.setValue);
  const singleKeyShortcutsHydrated = useHydratedStore(useSingleKeyShortcuts);
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [section] = usePageTab(SETTINGS_TABS);
  // An old `#shortcuts` link is about to be carried on to where it lives now: skip the list.
  const isIndex = useIsPageIndex(SETTINGS_TABS) && !Object.hasOwn(LEGACY_HASH_TARGETS, hash);
  const corpAccess = useCorpAccess();
  const groups = useMemo(
    () => visibleSettingsGroups({ corp: corpAccess.state === 'ready' }),
    [corpAccess.state]
  );

  useEffect(() => {
    // `hasOwn`: a hash like `#constructor` must not resolve to an inherited member.
    if (!Object.hasOwn(LEGACY_HASH_TARGETS, hash)) return;
    navigate({ pathname: LEGACY_HASH_TARGETS[hash] }, { replace: true });
  }, [hash, navigate]);

  if (isIndex) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader title={t('settings.title')} />
        <PhoneSettingsIndex groups={groups} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={t('settings.title')} actions={<SettingsBackLink />} />
      <div className="space-y-4 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:gap-6 md:space-y-0">
        <SettingsNav groups={groups} value={section} />
        <div className="min-w-0 space-y-4">
          {section === 'display' && (
            <>
              <Panel title={t('settings.displayTitle')}>
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
                  {/*
                  EVE runs on UTC and so does every timer other players quote,
                  which is why one column already rendered it before this was
                  settable. The Calendar grids are deliberately excluded — they
                  bucket events into local-day cells, so converting only the
                  rendered string would file a late-evening event under the wrong
                  day.
                */}
                  <ChipRow
                    label={t('settings.timeFormatLabel')}
                    hint={t('settings.timeFormatHint')}
                    options={TIME_FORMATS}
                    selected={timeFormat}
                    onSelect={(format) => void setTimeFormat(format)}
                    labelFor={(format) => t(`settings.timeFormat.${format}`)}
                  />
                  {weekStartHydrated && (
                    <ChipRow
                      label={t('settings.weekStartLabel')}
                      hint={t('settings.weekStartHint')}
                      options={CALENDAR_WEEK_START_DAYS}
                      selected={weekStart}
                      onSelect={(day) => void setWeekStart(day)}
                      labelFor={(day) => t(`settings.weekStart.${day}`)}
                    />
                  )}
                  {singleKeyShortcutsHydrated && (
                    <Field
                      label={t('settings.singleKeyShortcutsLabel')}
                      htmlFor="settings-single-key-shortcuts"
                      inline
                      note={t(
                        singleKeyShortcuts
                          ? 'settings.singleKeyShortcutsHint'
                          : 'settings.singleKeyShortcutsOffNote'
                      )}
                    >
                      <label className={touchCheckboxLabelClassName}>
                        <Checkbox
                          id="settings-single-key-shortcuts"
                          checked={singleKeyShortcuts}
                          onChange={() => void setSingleKeyShortcuts(!singleKeyShortcuts)}
                        />
                      </label>
                    </Field>
                  )}
                </Fields>
              </Panel>
              {isNarrow && <MobileTabsPanel />}
            </>
          )}
          {/*
            The Corporation row in here is the only way in to corp access for a
            Character that dismissed the one-time prompt (corp UI is hidden
            rather than locked), which is why `#corp-access` keeps redirecting
            to this section.
          */}
          {section === 'permissions' && <PermissionsPanel />}
          {section === 'industry' && (
            <>
              <IndustryDefaultsPanel />
              <BpcSourcingDefaultsPanel />
              <PiDefaultsPanel />
            </>
          )}
          {section === 'market' && <MarketDefaultsPanel />}
          {section === 'miningTax' && <MiningTaxDefaultsPanel />}
          {section === 'characters' && <CharacterDefaultsPanel />}
          {section === 'corporation' && <CorpDefaultsPanel />}
          {section === 'travel' && <TravelSettingsPanel />}
          {/* The Overview feed's "Settings" link targets `/settings/notifications` directly. */}
          {section === 'notifications' && <NotificationsPanel />}
          {/*
            The four short action panels sit two-up from `xl`: one column of
            them left most of each card empty. Export beside Import, since
            they are one round trip; the device's log-out row stays full width.
            Data Age goes last: its list grows with every endpoint and
            Character, and it is the least-used block on the page.
          */}
          {section === 'dataAge' && (
            <>
              <div className="grid items-start gap-4 xl:grid-cols-2">
                <DataPanel />
                <div className="space-y-4">
                  <UpdatePanel />
                  <InstallAppPanel />
                </div>
                <ExportPanel />
                <ImportPanel />
              </div>
              <AnalyticsPanel />
              <DevicePanel />
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
