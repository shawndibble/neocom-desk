import { useTranslation } from 'react-i18next';
import { Fields, Panel } from '@/components/ui';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useDarkThreshold, DARK_AFTER_DAY_OPTIONS } from '@/features/corp/darkThreshold';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import {
  npcCorporationText,
  useActiveNpcCorporation,
} from '@/features/corp/useActiveNpcCorporation';
import {
  SegmentedRow,
  SettingsHint,
  SettingsPanelLoading,
} from '@/features/settings/settingsFields';

export function CorpDefaultsPanel() {
  const { t } = useTranslation();
  const access = useCorpAccess();
  const npc = useActiveNpcCorporation();
  const darkAfterDays = useDarkThreshold((state) => state.value);
  const setDarkAfterDays = useDarkThreshold((state) => state.setValue);
  const hydrated = useHydratedStore(useDarkThreshold);

  if (access.state !== 'ready') {
    return (
      <Panel>
        <SettingsHint>
          {npc == null ? t('settings.corpUnavailable') : npcCorporationText(t, npc)}
        </SettingsHint>
      </Panel>
    );
  }
  if (!hydrated) return <SettingsPanelLoading />;

  return (
    <Panel>
      <div className="space-y-4">
        <Fields variant="form">
          <SegmentedRow
            label={t('settings.darkThresholdLabel')}
            hint={t('settings.darkThresholdHint')}
            options={DARK_AFTER_DAY_OPTIONS}
            selected={darkAfterDays}
            onSelect={(days) => void setDarkAfterDays(days)}
            labelFor={(days) => t('settings.days', { count: days })}
          />
        </Fields>
      </div>
    </Panel>
  );
}
