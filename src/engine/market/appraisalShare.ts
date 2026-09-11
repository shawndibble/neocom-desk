/**
 * Encodes an Appraisal pile into a compact, URL-safe string for the Share
 * link (#831), and decodes it back on the read-only view.
 *
 * Only `typeId:quantity` pairs travel in the link, never priced numbers —
 * both ends re-run `engine/market/appraisal.ts` against the decoded pairs at
 * view time, so the payload stays small and the viewer always sees current
 * pricing. `hub` is carried as a bare string rather than `TradeHub` (or its
 * id union) so this module never imports `@/market/hubs` — the same
 * engine/feature split `appraisal.ts` already draws, where the caller
 * (`features/market/appraisalData.ts`-equivalent for the share view) is what
 * resolves a hub id to a real `TradeHub` and rejects one that doesn't exist.
 *
 * A decoded payload is fully player-controlled — pasted into chat, clicked by
 * a stranger — so decoding never throws: every field is validated and a
 * malformed or forged payload (including one hand-built past the item
 * ceiling, bypassing `encodeAppraisalShare` entirely) comes back as
 * `{ ok: false, reason: 'invalid' }`.
 */

/**
 * Above this many items, the button disables itself with an explanation
 * rather than producing a link some chat clients truncate on paste/preview
 * (human call, issue #831 comments — realistic reprocessing/mining/hauling
 * pastes run to hundreds of distinct types, this covers that without
 * courting truncation).
 */
export const MAX_SHARE_ITEMS = 200;

/** Mirrors `features/market/pricePercent.ts`'s bounds — duplicated rather than
 * imported so this module never reaches into a feature layer that pulls in
 * Dexie sync. */
const MIN_PRICE_PERCENT = 0;
const MAX_PRICE_PERCENT = 1000;

export interface AppraisalShareItem {
  typeId: number;
  quantity: number;
}

export interface AppraisalShareInput {
  /** The Trade Hub id the pile was priced at, e.g. `'jita'`. Not validated here — see module doc. */
  hub: string;
  pricePercent: number;
  /** Epoch seconds the link was generated at. */
  generatedAt: number;
  items: readonly AppraisalShareItem[];
}

export type EncodeAppraisalShareResult =
  { ok: true; payload: string } | { ok: false; reason: 'empty' | 'too-large' };

export interface DecodedAppraisalShare {
  hub: string;
  pricePercent: number;
  generatedAt: number;
  items: AppraisalShareItem[];
}

export type DecodeAppraisalShareResult =
  { ok: true; value: DecodedAppraisalShare } | { ok: false; reason: 'invalid' };

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

const BASE36_TOKEN = /^[0-9a-z]+$/;

/**
 * `parseInt(str, 36)` parses a leading valid run and silently ignores
 * whatever follows (`parseInt('5.5', 36)` is `5`, not `NaN`) — too lax for a
 * decoder whose whole point is that a malformed or forged payload always
 * comes back `{ ok: false }`. This requires the entire token to be base36
 * digits before parsing it at all.
 */
function parseBase36(token: string): number | null {
  if (!BASE36_TOKEN.test(token)) return null;
  return parseInt(token, 36);
}

/**
 * `hub:percent:generatedAt:pairs`, `pairs` being `typeId-quantity` (both
 * base36, since both are always positive integers) joined by `_`. Only the
 * per-item pairs need to be compact — the header appears once — so only they
 * pay for base36; `pricePercent` may be fractional (`97.5`) and is carried as
 * a plain decimal string instead.
 */
export function encodeAppraisalShare(input: AppraisalShareInput): EncodeAppraisalShareResult {
  if (input.items.length === 0) return { ok: false, reason: 'empty' };
  if (input.items.length > MAX_SHARE_ITEMS) return { ok: false, reason: 'too-large' };

  const pairs = input.items
    .map((item) => `${item.typeId.toString(36)}-${item.quantity.toString(36)}`)
    .join('_');
  const payload = `${input.hub}:${input.pricePercent}:${input.generatedAt.toString(36)}:${pairs}`;
  return { ok: true, payload };
}

export function decodeAppraisalShare(payload: string): DecodeAppraisalShareResult {
  const parts = payload.split(':');
  if (parts.length !== 4) return { ok: false, reason: 'invalid' };
  const [hub, percentStr, generatedAtStr, pairsStr] = parts;

  if (hub === '') return { ok: false, reason: 'invalid' };

  const pricePercent = Number(percentStr);
  if (
    !Number.isFinite(pricePercent) ||
    pricePercent < MIN_PRICE_PERCENT ||
    pricePercent > MAX_PRICE_PERCENT
  ) {
    return { ok: false, reason: 'invalid' };
  }

  const generatedAt = parseBase36(generatedAtStr);
  if (generatedAt === null || generatedAt < 0) {
    return { ok: false, reason: 'invalid' };
  }

  if (pairsStr === '') return { ok: false, reason: 'invalid' };
  const pairTokens = pairsStr.split('_');
  if (pairTokens.length > MAX_SHARE_ITEMS) return { ok: false, reason: 'invalid' };

  const items: AppraisalShareItem[] = [];
  for (const token of pairTokens) {
    const segments = token.split('-');
    if (segments.length !== 2) return { ok: false, reason: 'invalid' };
    const [typeIdStr, quantityStr] = segments;
    const typeId = parseBase36(typeIdStr);
    const quantity = parseBase36(quantityStr);
    if (
      typeId === null ||
      quantity === null ||
      !isPositiveInteger(typeId) ||
      !isPositiveInteger(quantity)
    ) {
      return { ok: false, reason: 'invalid' };
    }
    items.push({ typeId, quantity });
  }

  return { ok: true, value: { hub, pricePercent, generatedAt, items } };
}
