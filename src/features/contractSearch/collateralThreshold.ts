import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { HIGH_COLLATERAL_RATIO } from '@/engine/contracts/courierRisk';

export const COURIER_COLLATERAL_RATIO_SETTING_KEY = 'sync.courierHighCollateralRatio';

export const COLLATERAL_RATIO_OPTIONS: readonly number[] = [20, 50, 100, 200];

export const useCourierCollateralRatio = createSyncedSetting<number>({
  key: COURIER_COLLATERAL_RATIO_SETTING_KEY,
  defaultValue: HIGH_COLLATERAL_RATIO,
  parse: (raw) => (typeof raw === 'number' && COLLATERAL_RATIO_OPTIONS.includes(raw) ? raw : null),
});
