import type { PriceState } from '@/engine/market/appraisal';

const MARK_KEY: Record<Exclude<PriceState, 'live'>, string> = {
  cached: 'market.appraisal.live.markCached',
  failed: 'market.appraisal.live.markFailed',
};

/** The words for a price that is not live (the Appraisal's price mark and its export); null once live. */
export function priceMarkKey(state: PriceState | undefined): string | null {
  return state === undefined || state === 'live' ? null : MARK_KEY[state];
}
