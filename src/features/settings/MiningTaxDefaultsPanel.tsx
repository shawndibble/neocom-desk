import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { MiningTaxSettingsForm } from '@/features/settings/MiningTaxSettingsForm';

export function MiningTaxDefaultsPanel() {
  const { t } = useTranslation();
  return (
    <Panel title={t('settings.miningTaxDefaultsTitle')}>
      <MiningTaxSettingsForm />
    </Panel>
  );
}
