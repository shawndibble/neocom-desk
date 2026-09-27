/**
 * How many times a courier's reward its collateral must reach before the
 * contract detail modal flags it `high-collateral` (issue #1720,
 * `engine/contracts/courierRisk.ts`).
 *
 * Settable because "far more than the reward" is a judgement about how much
 * ISK a pilot is willing to have at stake: a hauler with deep pockets treats a
 * 50x ask as routine, one hauling on a thin wallet wants the warning at 20x.
 * Presets rather than a free number, so the modal's copy stays legible.
 * Default 50, unchanged from before.
 *
 * Synced (`sync.courierHighCollateralRatio`): it describes the pilot's own
 * risk appetite, not the screen they are on.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { HIGH_COLLATERAL_RATIO } from '@/engine/contracts/courierRisk';

export const COURIER_COLLATERAL_RATIO_SETTING_KEY = 'sync.courierHighCollateralRatio';

export const COLLATERAL_RATIO_OPTIONS: readonly number[] = [20, 50, 100, 200];

export const useCourierCollateralRatio = createSyncedSetting<number>({
  key: COURIER_COLLATERAL_RATIO_SETTING_KEY,
  defaultValue: HIGH_COLLATERAL_RATIO,
  // Restricted to the presets: a value from a build with a different list
  // falls back to the default rather than flag by a multiple the copy cannot name.
  parse: (raw) => (typeof raw === 'number' && COLLATERAL_RATIO_OPTIONS.includes(raw) ? raw : null),
});
