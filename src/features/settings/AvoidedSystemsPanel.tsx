import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { AvoidedSystemsEditor } from '@/features/route/TravelRuleFields';
import { SettingsHint, SettingsScopeHint } from '@/features/settings/settingsFields';

/**
 * Settings → Travel: the pilot's Avoided Systems. The editor itself is shared
 * with Route Safety's Route rules panel (`features/route/TravelRuleFields.tsx`).
 */
export function AvoidedSystemsPanel() {
  const { t } = useTranslation();
  return (
    <Panel title={t('settings.avoidedSystems.title')}>
      <div className="space-y-4">
        <SettingsScopeHint scope="synced" />
        <SettingsHint>{t('settings.avoidedSystems.hint')}</SettingsHint>
        <AvoidedSystemsEditor />
      </div>
    </Panel>
  );
}
