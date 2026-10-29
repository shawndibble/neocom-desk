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
} from '@/components/ui';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { useMarketHub } from '@/features/market/hub';
import {
  COLLATERAL_RATIO_OPTIONS,
  useCourierCollateralRatio,
} from '@/features/contractSearch/collateralThreshold';
import {
  ITEM_FLAG_MULTIPLE_OPTIONS,
  useItemFlagMultiple,
} from '@/features/contractSearch/contractFlagThreshold';
import { RefiningSetupFields } from '@/features/refining/RefiningSetupFields';
import { useRefiningSetup } from '@/features/refining/useRefiningSetup';
import { LpValueField } from '@/features/settings/LpValueSettingsForm';
import {
  ChipRow,
  DefaultsSyncHint,
  SettingsPanelLoading,
} from '@/features/settings/settingsFields';

export function MarketDefaultsPanel() {
  const { t } = useTranslation();
  const hub = useMarketHub((state) => state.value);
  const setHub = useMarketHub((state) => state.setValue);
  const hubHydrated = useHydratedStore(useMarketHub);
  const collateralRatio = useCourierCollateralRatio((state) => state.value);
  const setCollateralRatio = useCourierCollateralRatio((state) => state.setValue);
  const collateralHydrated = useHydratedStore(useCourierCollateralRatio);
  const itemFlagMultiple = useItemFlagMultiple((state) => state.value);
  const setItemFlagMultiple = useItemFlagMultiple((state) => state.setValue);
  const itemFlagHydrated = useHydratedStore(useItemFlagMultiple);
  const refining = useRefiningSetup();
  const hydrated = hubHydrated && collateralHydrated && itemFlagHydrated && refining.hydrated;

  if (!hydrated) return <SettingsPanelLoading />;

  return (
    <Panel>
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

          <RefiningSetupFields refining={refining} />

          <ChipRow
            label={t('settings.courierCollateralLabel')}
            hint={t('settings.courierCollateralHint')}
            options={COLLATERAL_RATIO_OPTIONS}
            selected={collateralRatio}
            onSelect={(ratio) => void setCollateralRatio(ratio)}
            labelFor={(ratio) => t('settings.courierCollateralOption', { count: ratio })}
          />

          <ChipRow
            label={t('settings.itemContractFlagLabel')}
            hint={t('settings.itemContractFlagHint')}
            options={ITEM_FLAG_MULTIPLE_OPTIONS}
            selected={itemFlagMultiple}
            onSelect={(multiple) => void setItemFlagMultiple(multiple)}
            labelFor={(multiple) => t('settings.itemContractFlagOption', { count: multiple })}
          />

          <LpValueField id="settings-lp-value" />
        </Fields>
        <StructureFeesList />
      </div>
    </Panel>
  );
}
