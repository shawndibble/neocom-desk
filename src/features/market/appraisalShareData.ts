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
  generatedAt: number;
  appraisal: Appraisal;
  refining: { yieldRate: number; taxRate: number } | null;
  mineralNames: ReadonlyMap<number, string>;
  mineralPrices: ReadonlyMap<number, number>;
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
