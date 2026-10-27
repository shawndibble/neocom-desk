import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { BpcSourcingSettingsForm } from '@/features/settings/BpcSourcingSettingsForm';

/** BPC Sourcing is an Industry tab, so its starting filters live beside the Industry defaults. */
export function BpcSourcingDefaultsPanel() {
  const { t } = useTranslation();
  return (
    <Panel title={t('settings.bpcSourcingDefaultsTitle')}>
      <BpcSourcingSettingsForm />
    </Panel>
  );
}
