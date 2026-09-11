/**
 * The data path either side of an Appraisal share link (#831): building one
 * from a priced result, and resolving one back into a priced result for the
 * read-only view — the impure layer around `engine/market/appraisalShare.ts`,
 * the same split `appraisalData.ts` draws around `engine/market/appraisal.ts`.
 *
 * Resolving a link never assumes a session: `characterId` never enters this
 * path, so a signed-out visitor gets exactly the same repricing a signed-in
 * one would (no refine-then-sell comparison either — that stays primary-tab
 * only, the same way `compareHubs` already excludes it).
 */
import { buildAppraisal, type Appraisal, type AppraisalItem } from '@/engine/market/appraisal';
import {
  decodeAppraisalShare,
  encodeAppraisalShare,
  MAX_SHARE_ITEMS,
  type EncodeAppraisalShareResult,
} from '@/engine/market/appraisalShare';
import { getTradeHub, type TradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import type { AppraisalOutcome } from './appraisalData';

export { MAX_SHARE_ITEMS };

export type BuildAppraisalShareLinkResult =
  { ok: true; url: string } | { ok: false; reason: 'empty' | 'too-large' };

/** Builds the shareable URL for the priced rows a paste just resolved to. */
export function buildAppraisalShareLink(
  outcome: AppraisalOutcome,
  hub: TradeHub,
  pricePercent: number
): BuildAppraisalShareLinkResult {
  const items = outcome.appraisal.rows.map((row) => ({
    typeId: row.typeId,
    quantity: row.quantity,
  }));
  const encoded: EncodeAppraisalShareResult = encodeAppraisalShare({
    hub: hub.id,
    pricePercent,
    generatedAt: Math.floor(Date.now() / 1000),
    items,
  });
  if (!encoded.ok) return encoded;

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const query = new URLSearchParams({ d: encoded.payload }).toString();
  return { ok: true, url: `${window.location.origin}${base}/share/appraisal?${query}` };
}

export interface AppraisalShareView {
  hub: TradeHub;
  pricePercent: number;
  /** Epoch seconds the link was generated at. */
  generatedAt: number;
  appraisal: Appraisal;
  /** Type ids the link carried that this build's bundled SDE cannot name — reported, never dropped. */
  unresolvedTypeIds: number[];
}

export type ResolveAppraisalShareResult =
  | { ok: true; value: AppraisalShareView }
  | { ok: false; reason: 'invalid-payload' | 'unknown-hub' };

/** Decodes a share payload and re-prices it live, the same as `appraisePaste` but from `typeId:quantity` pairs instead of a name paste. */
export async function resolveAppraisalShare(payload: string): Promise<ResolveAppraisalShareResult> {
  const decoded = decodeAppraisalShare(payload);
  if (!decoded.ok) return { ok: false, reason: 'invalid-payload' };

  const hub = getTradeHub(decoded.value.hub);
  if (!hub) return { ok: false, reason: 'unknown-hub' };

  const types = await loadMarketTypes();
  const nameByTypeId = new Map(types.map((type) => [type.typeId, type.name]));

  const unresolvedTypeIds: number[] = [];
  const resolved: { typeId: number; name: string; quantity: number }[] = [];
  for (const item of decoded.value.items) {
    const name = nameByTypeId.get(item.typeId);
    if (name === undefined) {
      unresolvedTypeIds.push(item.typeId);
      continue;
    }
    resolved.push({ typeId: item.typeId, name, quantity: item.quantity });
  }

  const prices = await getHubPrices(
    hub,
    resolved.map((entry) => entry.typeId)
  );
  const items: AppraisalItem[] = resolved.map((entry) => {
    const aggregate = prices.get(entry.typeId);
    return {
      typeId: entry.typeId,
      name: entry.name,
      quantity: entry.quantity,
      buy: aggregate?.buyMax ?? null,
      sell: aggregate?.sellMin ?? null,
    };
  });

  return {
    ok: true,
    value: {
      hub,
      pricePercent: decoded.value.pricePercent,
      generatedAt: decoded.value.generatedAt,
      appraisal: buildAppraisal(items, decoded.value.pricePercent),
      unresolvedTypeIds,
    },
  };
}
