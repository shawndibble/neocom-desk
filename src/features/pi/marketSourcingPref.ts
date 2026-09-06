/**
 * Device-local: may the Advisor assume you can buy planetary inputs at a hub?
 *
 * Off by default, and that default is the point. Buying P1 to feed an Advanced
 * Industry Facility is a good strategy and a common one, but it assumes a trade
 * hub you can actually reach — the pilot this was built with is thirty minutes
 * out, which turns "+6,300 ISK an hour" into a standing freight commitment they
 * did not agree to. Advice that quietly assumes a shop next door is advice for
 * somebody else's operation.
 *
 * What it does *not* gate is routing between the pilot's own colonies. That is
 * hauling too, but it is hauling they already control, and it is the case the
 * Advisor exists to spot: four planets each refining a different P1 that no one
 * planet can combine. `planNetwork` finds those with this off.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const PI_MARKET_SOURCING_KEY = 'piMarketSourcing';

export const DEFAULT_PI_MARKET_SOURCING = false;

export const useMarketSourcing = createLocalSetting<boolean>({
  key: PI_MARKET_SOURCING_KEY,
  defaultValue: DEFAULT_PI_MARKET_SOURCING,
});
