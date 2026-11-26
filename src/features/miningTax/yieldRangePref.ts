import { createLocalSetting } from '@/lib/useLocalSetting';
import { MINING_YIELD_RANGES, type MiningYieldRange } from '@/engine/miningTax/yieldRange';

export const MINING_YIELD_RANGE_KEY = 'miningYieldRange';

export const DEFAULT_MINING_YIELD_RANGE: MiningYieldRange = '30d';

function isMiningYieldRange(raw: unknown): raw is MiningYieldRange {
  return MINING_YIELD_RANGES.includes(raw as MiningYieldRange);
}

export const useMiningYieldRange = createLocalSetting<MiningYieldRange>({
  key: MINING_YIELD_RANGE_KEY,
  defaultValue: DEFAULT_MINING_YIELD_RANGE,
  parse: (raw) => (isMiningYieldRange(raw) ? raw : null),
});
