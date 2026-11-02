/**
 * Which side of the book the Appraisal's single refine figures are priced on:
 * the buy orders (sell into them now), the sell orders (list at their price) or
 * halfway between. Picked in the Refine breakdown, remembered on this device,
 * and read by the Refine total column, the header chip, the "refine" copy list
 * and the highlights, so every appraisal after it uses the same pick.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { RefineBasis } from '@/engine/market/appraisal';

export const REFINE_BASES: readonly RefineBasis[] = ['buy', 'split', 'sell'];

export const useRefineBasis = createLocalSetting<RefineBasis>({
  key: 'appraisalRefineBasis',
  defaultValue: 'buy',
  parse: (raw) => (raw === 'buy' || raw === 'split' || raw === 'sell' ? raw : null),
});
