import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { BpcSourcingSettingsForm } from '@/features/settings/BpcSourcingSettingsForm';

export function BpcSourcingDefaultsPanel() {
  const { t } = useTranslation();
  return (
    <Panel title={t('settings.bpcSourcingDefaultsTitle')}>
      <BpcSourcingSettingsForm />
    </Panel>
  );
}
