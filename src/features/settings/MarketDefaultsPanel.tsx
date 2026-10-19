import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StructureFeesList } from '@/features/market/StructureFeesList';
import {
  Field,
  Fields,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { useMarketHub } from '@/features/market/hub';
import {
  COLLATERAL_RATIO_OPTIONS,
  useCourierCollateralRatio,
} from '@/features/contractSearch/collateralThreshold';
import { LpValueField } from '@/features/settings/LpValueSettingsForm';
import { ChipRow, DefaultsSyncHint } from '@/features/settings/settingsFields';

export function MarketDefaultsPanel() {
  const { t } = useTranslation();
  const hub = useMarketHub((state) => state.value);
  const setHub = useMarketHub((state) => state.setValue);
  const hubHydrated = useHydratedStore(useMarketHub);
  const collateralRatio = useCourierCollateralRatio((state) => state.value);
  const setCollateralRatio = useCourierCollateralRatio((state) => state.setValue);
  const collateralHydrated = useHydratedStore(useCourierCollateralRatio);
  const hydrated = hubHydrated && collateralHydrated;
  const headingRef = useRef<HTMLHeadingElement>(null);

  return (
    <Panel title={t('settings.marketDefaultsTitle')} headingRef={headingRef}>
      {hydrated ? (
        <div className="space-y-4">
          <DefaultsSyncHint />
          <Fields variant="form">
            <Field
              label={t('settings.tradeHubLabel')}
              htmlFor="settings-hub"
              note={t('settings.tradeHubHint')}
            >
              <Select value={hub} onValueChange={(value) => void setHub(value as TradeHub['id'])}>
                <SelectTrigger id="settings-hub" aria-label={t('settings.tradeHubLabel')}>
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

            <ChipRow
              label={t('settings.courierCollateralLabel')}
              hint={t('settings.courierCollateralHint')}
              options={COLLATERAL_RATIO_OPTIONS}
              selected={collateralRatio}
              onSelect={(ratio) => void setCollateralRatio(ratio)}
              labelFor={(ratio) => t('settings.courierCollateralOption', { count: ratio })}
            />

            <LpValueField id="settings-lp-value" />
          </Fields>
          <StructureFeesList panelHeading={headingRef} />
        </div>
      ) : (
        <Spinner />
      )}
    </Panel>
  );
}
