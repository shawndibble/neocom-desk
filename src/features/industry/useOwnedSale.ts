import { useMemo } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { BuildResult } from '@/engine/industry/types';
import { planOwnedStockSale } from '@/engine/industry/ownedStockSale';
import type { pricingSourcesForHub } from './buildPlanPricingInputs';
import type { MarketSnapshot } from './marketData';
import type { PlanVerdict } from './planPricing';

export function useOwnedSale(
  result: BuildResult | null,
  snapshot: MarketSnapshot | null,
  modifiers: CharacterModifiers,
  standing: ReturnType<typeof pricingSourcesForHub>['standing']
): PlanVerdict['ownedSale'] {
  return useMemo(() => {
    if (!result || !snapshot) return null;
    return {
      instant: planOwnedStockSale(
        result.materials,
        snapshot,
        'instant',
        modifiers.skills,
        standing
      ),
      order: planOwnedStockSale(result.materials, snapshot, 'order', modifiers.skills, standing),
    };
  }, [result, snapshot, modifiers, standing]);
}
