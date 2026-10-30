import { useMemo } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { BuildResult } from '@/engine/industry/types';
import { planOwnedStockSale } from '@/engine/industry/ownedStockSale';
import type { pricingSourcesForHub } from './buildPlanPricingInputs';
import type { MarketSnapshot } from './marketData';
import type { OwnedSale } from './planHeroFigures';

/**
 * Both liquidation bases at once, so the Use-or-sell toggle switches between
 * two numbers already in hand rather than re-deriving one per click. Sell-now
 * reads the buy side of the book (what a standing order pays today), sell-order
 * the sell side (what listing your own stack asks) — deliberately independent
 * of the plan's *material* price basis, which is about buying, not selling.
 */
export function useOwnedSale(
  result: BuildResult | null,
  snapshot: MarketSnapshot | null,
  modifiers: CharacterModifiers,
  standing: ReturnType<typeof pricingSourcesForHub>['standing']
): OwnedSale | null {
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
