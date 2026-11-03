import { Panel } from '@/components/ui';
import { PiSettingsForm } from '@/features/settings/PiSettingsForm';

/** Beside the Industry section because Planetary Industry is an industry page; its own panel because its one control has nothing to do with a build. */
export function PiDefaultsPanel() {
  return (
    <Panel>
      <div className="space-y-4">
        <PiSettingsForm showSellAt />
      </div>
    </Panel>
  );
}
