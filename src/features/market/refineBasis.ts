import { createLocalSetting } from '@/lib/useLocalSetting';
import { REFINE_BASES, type RefineBasis } from '@/engine/market/appraisal';

export const useRefineBasis = createLocalSetting<RefineBasis>({
  key: 'appraisalRefineBasis',
  defaultValue: 'buy',
  parse: (raw) => REFINE_BASES.find((basis) => basis === raw) ?? null,
});
