import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { useTranslation } from 'react-i18next';
import { Checkbox, Field, Fields, Spinner } from '@/components/ui';
import {
  useBpcHideAuctionsDefault,
  useBpcHidePlexDefault,
} from '@/features/bpcContracts/sourcingDefaults';
import { DefaultsSyncHint } from './settingsFields';
import { useHydratedStore } from './useHydratedStore';

/** BPC Sourcing's settings: Settings → Industry, and the BPC Sourcing tab's settings modal. */
export function BpcSourcingSettingsForm() {
  const { t } = useTranslation();
  const hideAuctions = useBpcHideAuctionsDefault((state) => state.value);
  const setHideAuctions = useBpcHideAuctionsDefault((state) => state.setValue);
  const hidePlex = useBpcHidePlexDefault((state) => state.value);
  const setHidePlex = useBpcHidePlexDefault((state) => state.setValue);

  const hideAuctionsHydrated = useHydratedStore(useBpcHideAuctionsDefault);
  const hidePlexHydrated = useHydratedStore(useBpcHidePlexDefault);
  if (!hideAuctionsHydrated || !hidePlexHydrated) return <Spinner />;

  return (
    <div className="space-y-4">
      <DefaultsSyncHint />
      <Fields variant="form">
        <Field
          label={t('settings.bpcHideAuctionsLabel')}
          htmlFor="settings-bpc-hide-auctions"
          inline
        >
          <label className={touchCheckboxLabelClassName}>
            <Checkbox
              id="settings-bpc-hide-auctions"
              checked={hideAuctions}
              onChange={() => void setHideAuctions(!hideAuctions)}
            />
          </label>
        </Field>
        <Field
          label={t('settings.bpcHidePlexLabel')}
          htmlFor="settings-bpc-hide-plex"
          inline
          note={t('settings.bpcHideHint')}
        >
          <label className={touchCheckboxLabelClassName}>
            <Checkbox
              id="settings-bpc-hide-plex"
              checked={hidePlex}
              onChange={() => void setHidePlex(!hidePlex)}
            />
          </label>
        </Field>
      </Fields>
    </div>
  );
}
