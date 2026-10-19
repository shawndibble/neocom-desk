import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { PiSettingsForm } from '@/features/settings/PiSettingsForm';

/** Beside the Industry defaults because Planetary Industry is an industry page; its own panel because its one control has nothing to do with a build. */
export function PiDefaultsPanel() {
  const { t } = useTranslation();
  return (
    <Panel title={t('settings.piDefaultsTitle')}>
      <PiSettingsForm showSellAt />
    </Panel>
  );
}
