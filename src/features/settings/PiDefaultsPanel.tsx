import { Panel } from '@/components/ui';
import { PiSettingsForm } from '@/features/settings/PiSettingsForm';

export function PiDefaultsPanel() {
  return (
    <Panel>
      <div className="space-y-4">
        <PiSettingsForm showSellAt />
      </div>
    </Panel>
  );
}
