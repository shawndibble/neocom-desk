/**
 * A **Shared Appraisal** back into its read-only view: the stored snapshot
 * (`engine/market/appraisalSnapshot.ts`) rebuilt with the same
 * `buildAppraisal` the live tab runs, at the prices it was shared with.
 *
 * No session enters this path, so a signed-out visitor sees exactly what a
 * signed-in one would. That includes the refine-then-sell figures, which the
 * snapshot carries as the sharer's resolved yield rather than their skills
 * (`refine` below); `itemsWithMyRefine` swaps in the visitor's own.
 * `compareHubs` stays excluded: it is a primary-tab comparison.
 */
import {
  buildAppraisal,
  computeAppraisalRefine,
  type Appraisal,
  type AppraisalItem,
} from '@/engine/market/appraisal';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { RefiningSetup } from '@/engine/industry/refiningSetup';
import {
  appraisalItemsFromSnapshot,
  type AppraisalSnapshot,
} from '@/engine/market/appraisalSnapshot';
import { getTradeHub, type TradeHub } from '@/market/hubs';
import type { ReprocessingType } from '@/sde/types';

export interface AppraisalShareView {
  hub: TradeHub;
  pricePercent: number;
  /** Epoch seconds the appraisal was priced at. */
  generatedAt: number;
  appraisal: Appraisal;
  /** The sharer's facility yield and tax; null on a link that carries no refine figures. */
  refining: { yieldRate: number; taxRate: number } | null;
  /** Mineral names as shared, for the breakdown's table. */
  mineralNames: ReadonlyMap<number, string>;
  /** Mineral buy prices as shared (100% of the hub's buy side), kept for recomputing at the visitor's own numbers. */
  mineralPrices: ReadonlyMap<number, number>;
  /** The same on the sell side; undefined on a link from before the sell side travelled with it. */
  mineralSellPrices?: ReadonlyMap<number, number>;
}

export type AppraisalShareViewResult =
  { ok: true; value: AppraisalShareView } | { ok: false; reason: 'unknown-hub' };

export function appraisalShareViewFromSnapshot(
  snapshot: AppraisalSnapshot
): AppraisalShareViewResult {
  const hub = getTradeHub(snapshot.hub);
  if (!hub) return { ok: false, reason: 'unknown-hub' };
  const minerals = snapshot.refine?.minerals ?? [];
  return {
    ok: true,
    value: {
      hub,
      pricePercent: snapshot.pricePercent,
      generatedAt: snapshot.generatedAt,
      appraisal: buildAppraisal(appraisalItemsFromSnapshot(snapshot), snapshot.pricePercent),
      refining: snapshot.refine
        ? { yieldRate: snapshot.refine.yieldRate, taxRate: snapshot.refine.taxRate }
        : null,
      mineralNames: new Map(minerals.map((m) => [m.typeId, m.name])),
      mineralPrices: new Map(
        minerals.flatMap((m): [number, number][] => (m.price === null ? [] : [[m.typeId, m.price]]))
      ),
      // Absent, not empty, on a link from before the sell side travelled with it.
      mineralSellPrices: minerals.some((m) => m.sellPrice !== undefined)
        ? new Map(
            minerals.flatMap((m): [number, number][] =>
              m.sellPrice == null ? [] : [[m.typeId, m.sellPrice]]
            )
          )
        : undefined,
    },
  };
}

/**
 * The shared items refined at the visitor's own Refining Setup and skills
 * instead of the sharer's, still at the shared mineral prices, so the only
 * thing that moves is the numbers that are theirs. An item with no
 * reprocessing data on this side has no refine figure.
 */
export function itemsWithMyRefine(
  view: Pick<AppraisalShareView, 'appraisal' | 'mineralPrices' | 'mineralSellPrices'>,
  mine: {
    reprocessing: Readonly<Record<string, ReprocessingType>>;
    modifiers: CharacterModifiers;
    refining: RefiningSetup;
  }
): AppraisalItem[] {
  return view.appraisal.items.map((item) => {
    const rest: AppraisalItem = { ...item };
    delete rest.refine;
    const entry = mine.reprocessing[String(item.typeId)];
    if (!entry) return rest;
    const materialPrices: Record<number, number> = {};
    const materialSellPrices: Record<number, number> = {};
    for (const material of entry.materials) {
      const price = view.mineralPrices.get(material.typeID);
      if (price !== undefined) materialPrices[material.typeID] = price;
      const sellPrice = view.mineralSellPrices?.get(material.typeID);
      if (sellPrice !== undefined) materialSellPrices[material.typeID] = sellPrice;
    }
    const refine = computeAppraisalRefine({
      quantity: item.quantity,
      reprocessing: {
        portionSize: entry.portionSize,
        materials: entry.materials.map((m) => ({ typeId: m.typeID, quantity: m.quantity })),
        specialisationSkillId: entry.specialisationSkillID,
      },
      modifiers: mine.modifiers,
      refining: mine.refining,
      materialPrices,
      materialSellPrices: view.mineralSellPrices ? materialSellPrices : undefined,
    });
    return refine ? { ...rest, refine } : rest;
  });
}
