/**
 * A **Shared Appraisal** back into its read-only view: the stored snapshot
 * (`engine/market/appraisalSnapshot.ts`) rebuilt with the same
 * `buildAppraisal` the live tab runs, at the prices it was shared with.
 *
 * No session enters this path, so a signed-out visitor sees exactly what a
 * signed-in one would — and no refine-then-sell comparison either, which
 * depends on the sharer's skills and stays primary-tab only, the same way
 * `compareHubs` already excludes it.
 */
import { buildAppraisal, type Appraisal } from '@/engine/market/appraisal';
import type { AppraisalSnapshot } from '@/engine/market/appraisalSnapshot';
import { getTradeHub, type TradeHub } from '@/market/hubs';

export interface AppraisalShareView {
  hub: TradeHub;
  pricePercent: number;
  /** Epoch seconds the appraisal was priced at. */
  generatedAt: number;
  appraisal: Appraisal;
}

export type AppraisalShareViewResult =
  { ok: true; value: AppraisalShareView } | { ok: false; reason: 'unknown-hub' };

export function appraisalShareViewFromSnapshot(
  snapshot: AppraisalSnapshot
): AppraisalShareViewResult {
  const hub = getTradeHub(snapshot.hub);
  if (!hub) return { ok: false, reason: 'unknown-hub' };
  return {
    ok: true,
    value: {
      hub,
      pricePercent: snapshot.pricePercent,
      generatedAt: snapshot.generatedAt,
      appraisal: buildAppraisal(snapshot.items, snapshot.pricePercent),
    },
  };
}
