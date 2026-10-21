import { useTranslation } from 'react-i18next';
import { CollapsiblePanel } from '@/components/ui';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
import { useAvoidedSystemsEnabled } from '@/features/route/routeRules';
import { AvoidedSystemsEditor } from '@/features/route/TravelRuleFields';
import { SettingsHint, SettingsScopeHint } from '@/features/settings/settingsFields';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { usePhoneFold } from './usePhoneFold';

/**
 * Settings → Travel: the pilot's Avoided Systems. The editor itself is shared
 * with Route Safety's Route rules panel (`features/route/TravelRuleFields.tsx`).
 * On a phone it folds behind a one-line count; above `md` it is always open.
 */
export function AvoidedSystemsPanel() {
  const { t } = useTranslation();
  const fold = usePhoneFold();
  const count = useAvoidedSystems((state) => state.value.length);
  const enabled = useAvoidedSystemsEnabled((state) => state.value);
  // The folded editor is unmounted, so nothing else hydrates the summary's stores.
  const hydrated = useHydratedStore(useAvoidedSystems, useAvoidedSystemsEnabled);
  return (
    <CollapsiblePanel
      title={t('settings.avoidedSystems.title')}
      meta={
        fold.phone && hydrated
          ? t(enabled ? 'settings.avoidedSystems.summary' : 'settings.avoidedSystems.summaryOff', {
              count,
            })
          : undefined
      }
      wrapMeta
      expanded={fold.expanded}
      collapsible={fold.phone}
      caretSize="row"
      onToggle={fold.toggle}
      labels={{ show: t('settings.avoidedSystems.show'), hide: t('settings.avoidedSystems.hide') }}
    >
      <div className="space-y-4">
        <SettingsScopeHint scope="synced" />
        <SettingsHint>{t('settings.avoidedSystems.hint')}</SettingsHint>
        <AvoidedSystemsEditor />
      </div>
    </CollapsiblePanel>
  );
}
