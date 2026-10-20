import { Panel } from '@/components/ui';
import { MiningTaxSettingsForm } from '@/features/settings/MiningTaxSettingsForm';

export function MiningTaxDefaultsPanel() {
  return (
    <Panel>
      <MiningTaxSettingsForm />
    </Panel>
  );
}
