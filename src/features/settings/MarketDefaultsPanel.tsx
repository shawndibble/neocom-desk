import { useTranslation } from 'react-i18next';
import { StructureFeesList } from '@/features/market/StructureFeesList';
import { Fields, Panel } from '@/components/ui';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useDefaultMarketHub } from '@/features/market/hub';
import { useHubByCharacter } from '@/features/market/characterHubs';
import { TradeHubField } from '@/features/settings/TradeHubField';
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
  const hubHydrated = useHydratedStore(useDefaultMarketHub, useHubByCharacter);
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
          <TradeHubField />

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
