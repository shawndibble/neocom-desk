import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { IndustrySettingsForm } from '@/features/settings/IndustrySettingsForm';

/**
 * What a page assumes when the pilot has not said otherwise. Every control
 * in the other Defaults panels in this folder defaults to exactly what the app did before it
 * was settable, so an existing pilot's numbers do not move until they ask
 * them to.
 *
 * All of them sync (`lib/useSyncedSetting.ts`): these answer for the pilot,
 * not for the machine. The text-scale control does not — that one answers for
 * the screen.
 *
 * One panel per Settings section (Industry, Market, Characters), each gating
 * on its own stores: a control that rendered its default first would not
 * merely flicker, a press landing in that window would write the default over
 * what is on disk.
 */
export function IndustryDefaultsPanel() {
  const { t } = useTranslation();
  return (
    <Panel title={t('settings.industryBlueprintTitle')}>
      <IndustrySettingsForm />
    </Panel>
  );
}
