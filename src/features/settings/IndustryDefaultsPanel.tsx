import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { IndustrySettingsForm } from '@/features/settings/IndustrySettingsForm';

export function IndustryDefaultsPanel() {
  const { t } = useTranslation();
  return (
    <Panel title={t('settings.industryBlueprintTitle')}>
      <IndustrySettingsForm />
    </Panel>
  );
}
