import { useTranslation } from 'react-i18next';
import { Field, Fields } from '@/components/ui';
import {
  useBpcHideAuctionsDefault,
  useBpcHidePlexDefault,
} from '@/features/bpcContracts/sourcingDefaults';
import { useMarketHub } from '@/features/market/hub';
import { HubField } from '@/features/market/HubMenu';
import { usePageHubs } from '@/features/market/pageHubs';
import { CheckboxField, SettingsFormLoading } from './settingsFields';
import { useHydratedStore } from '@/lib/useHydratedStore';

/** BPC Sourcing's settings: Settings → Industry, and the BPC Sourcing tab's settings modal. */
export function BpcSourcingSettingsForm() {
  const { t } = useTranslation();
  const hideAuctions = useBpcHideAuctionsDefault((state) => state.value);
  const setHideAuctions = useBpcHideAuctionsDefault((state) => state.setValue);
  const hidePlex = useBpcHidePlexDefault((state) => state.value);
  const setHidePlex = useBpcHidePlexDefault((state) => state.setValue);

  const hideAuctionsHydrated = useHydratedStore(useBpcHideAuctionsDefault);
  const hidePlexHydrated = useHydratedStore(useBpcHidePlexDefault);
  const hubHydrated = useHydratedStore(useMarketHub, usePageHubs);
  if (!hideAuctionsHydrated || !hidePlexHydrated || !hubHydrated) return <SettingsFormLoading />;

  return (
    <div className="space-y-4">
      <Fields variant="form">
        {/* The Industry page hub: Global unless the pilot gave Industry its own. */}
        <Field label={t('settings.bpcMarketHubLabel')} note={t('settings.bpcMarketHubHint')}>
          <HubField area="industry" label={t('settings.bpcMarketHubLabel')} />
        </Field>
        <CheckboxField
          id="settings-bpc-hide-auctions"
          label={t('settings.bpcHideAuctionsLabel')}
          hint={t('settings.bpcHideAuctionsHint')}
          checked={hideAuctions}
          onChange={() => void setHideAuctions(!hideAuctions)}
        />
        <CheckboxField
          id="settings-bpc-hide-plex"
          label={t('settings.bpcHidePlexLabel')}
          hint={t('settings.bpcHideHint')}
          checked={hidePlex}
          onChange={() => void setHidePlex(!hidePlex)}
        />
      </Fields>
    </div>
  );
}
