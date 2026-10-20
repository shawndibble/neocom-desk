import { useTranslation } from 'react-i18next';
import {
  Field,
  Fields,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import {
  useBpcHideAuctionsDefault,
  useBpcHidePlexDefault,
} from '@/features/bpcContracts/sourcingDefaults';
import { useMarketHub } from '@/features/market/hub';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { CheckboxField, DefaultsSyncHint } from './settingsFields';
import { useHydratedStore } from '@/lib/useHydratedStore';

/** BPC Sourcing's settings: Settings → Industry, and the BPC Sourcing tab's settings modal. */
export function BpcSourcingSettingsForm() {
  const { t } = useTranslation();
  const hideAuctions = useBpcHideAuctionsDefault((state) => state.value);
  const setHideAuctions = useBpcHideAuctionsDefault((state) => state.setValue);
  const hidePlex = useBpcHidePlexDefault((state) => state.value);
  const setHidePlex = useBpcHidePlexDefault((state) => state.setValue);

  const hub = useMarketHub((state) => state.value);
  const setHub = useMarketHub((state) => state.setValue);

  const hideAuctionsHydrated = useHydratedStore(useBpcHideAuctionsDefault);
  const hidePlexHydrated = useHydratedStore(useBpcHidePlexDefault);
  const hubHydrated = useHydratedStore(useMarketHub);
  if (!hideAuctionsHydrated || !hidePlexHydrated || !hubHydrated) return <Spinner />;

  return (
    <div className="space-y-4">
      <DefaultsSyncHint />
      <Fields variant="form">
        {/* The same synced Default trade hub as Settings → Market defaults. */}
        <Field
          label={t('settings.bpcMarketHubLabel')}
          htmlFor="settings-bpc-hub"
          note={t('settings.bpcMarketHubHint')}
        >
          <Select value={hub} onValueChange={(value) => void setHub(value as TradeHub['id'])}>
            <SelectTrigger id="settings-bpc-hub" aria-label={t('settings.bpcMarketHubLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRADE_HUBS.map((tradeHub) => (
                <SelectItem key={tradeHub.id} value={tradeHub.id}>
                  {tradeHub.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <CheckboxField
          id="settings-bpc-hide-auctions"
          label={t('settings.bpcHideAuctionsLabel')}
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
