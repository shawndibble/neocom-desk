/**
 * Standing buyback Requests (issue #4780): the pure rules. A buyback is a
 * Request that stays open, pays a Rate (a % of a Trade Hub's buy or sell
 * price) and asks for item types or whole groups ("all ore"). A Member's Sell
 * to quote prices their pile at the Rate and is held 14 days. No Firestore,
 * fetch or DOM here.
 */

/** Mirrors `functions/src/communityRequests.ts`, which enforces them. */
export const MIN_RATE = 1;
export const MAX_RATE = 200;
/** A buyback quote is held this long: buybacks sit a while before the contract is made. */
export const QUOTE_HOLD_MS = 14 * 24 * 60 * 60 * 1000;
/** Priced lines one quote carries. */
export const MAX_QUOTE_LINES = 50;
/** Buy lines one standing Request holds: the callable's cap. */
export const MAX_BUY_LINES = 50;

export const RATE_BASES = ['buy', 'sell'] as const;
export type RateBasis = (typeof RATE_BASES)[number];

/** The Trade Hubs a buyback may name: the ids of `src/market/hubs.ts`, which a parity test pins. */
export const BUYBACK_HUB_IDS = ['jita', 'amarr', 'dodixie', 'rens', 'hek'] as const;
export type BuybackHubId = (typeof BUYBACK_HUB_IDS)[number];

/** A Rate is a percent in tenths, so 92.5 is allowed and 92.55 is not. */
export function isValidRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_RATE &&
    value <= MAX_RATE &&
    Math.abs(value * 10 - Math.round(value * 10)) < 1e-9
  );
}

/**
 * A rate as typed: "90", "92,5" or "92.5 %". Only digits, one optional decimal
 * place and a percent sign; "1,000" or "9e1" is not a rate, so a typo never
 * becomes a valid one.
 */
export function parseRate(text: string): number | null {
  const match = /^(\d{1,3}(?:[.,]\d)?)\s*%?$/.exec(text.trim());
  if (!match) return null;
  const rate = Number(match[1].replace(',', '.'));
  return isValidRate(rate) ? rate : null;
}

/** An item as a group sees it; null where the SDE group (or its category) is unknown. */
export interface BuybackItem {
  typeId: number;
  groupId: number | null;
  categoryId: number | null;
}

interface GroupTable {
  categoryIds: readonly number[];
  groupIds: readonly number[];
}

/**
 * The groups a buyback can name, by SDE category and group id. Fixed on
 * purpose: a corp picks from a short list, never builds a rule.
 */
export const BUYBACK_GROUPS = {
  // Category 25 (Asteroid) minus ice (group 465): ore, moon ore, compressed.
  ore: { categoryIds: [25], groupIds: [] },
  // Group 465 (Ice, compressed ice included).
  ice: { categoryIds: [], groupIds: [465] },
  // Group 18 (Mineral).
  minerals: { categoryIds: [], groupIds: [18] },
  // Group 711 (Harvestable Cloud).
  gas: { categoryIds: [], groupIds: [711] },
  // Categories 42 (P0) and 43 (P1–P4).
  pi: { categoryIds: [42, 43], groupIds: [] },
  // Group 754 (Salvaged Materials).
  salvage: { categoryIds: [], groupIds: [754] },
} as const satisfies Record<string, GroupTable>;

export type BuybackGroup = keyof typeof BUYBACK_GROUPS;

export const BUYBACK_GROUP_KEYS = Object.keys(BUYBACK_GROUPS) as BuybackGroup[];

export const isBuybackGroup = (value: unknown): value is BuybackGroup =>
  typeof value === 'string' && Object.hasOwn(BUYBACK_GROUPS, value);

/** What a standing Request buys: one item type, or every item of a group. */
export type BuybackLine =
  { kind: 'type'; typeId: number; name: string } | { kind: 'group'; group: BuybackGroup };

/** What makes a Request standing: the rate it pays, where, to whom, and what it buys. */
export interface StandingRequest {
  rate: number;
  rateBasis: RateBasis;
  hubId: BuybackHubId;
  /** The Character contracts go to; null means the requester's own. */
  buyerCharacterId: number | null;
  buyLines: BuybackLine[];
}

/** A line's identity, for duplicate checks. */
export const buybackLineKey = (line: BuybackLine) =>
  line.kind === 'type' ? `type:${line.typeId}` : `group:${line.group}`;

export function buybackLineCovers(line: BuybackLine, item: BuybackItem): boolean {
  if (line.kind === 'type') return line.typeId === item.typeId;
  const { categoryIds, groupIds } = BUYBACK_GROUPS[line.group];
  // Ice sits in the Asteroid category, so a group line is not ore when ice names it.
  if (line.group === 'ore' && item.groupId === 465) return false;
  return (
    (item.groupId !== null && groupIds.some((id) => id === item.groupId)) ||
    (item.categoryId !== null && categoryIds.some((id) => id === item.categoryId))
  );
}

/** Whether any line of a standing Request buys this item. */
export const buybackCovers = (lines: readonly BuybackLine[], item: BuybackItem) =>
  lines.some((line) => buybackLineCovers(line, item));

export interface QuoteInput {
  typeId: number;
  name: string;
  quantity: number;
  /** The hub price of one unit on the Request's basis; null when the hub has none. */
  unitPrice: number | null;
}

export interface QuoteLine {
  typeId: number;
  name: string;
  quantity: number;
  /** The hub price used, so the figure can be checked later. */
  unitPrice: number;
  /** At the Rate, rounded down to a whole ISK. */
  total: number;
}

export interface PricedQuote {
  lines: QuoteLine[];
  total: number;
  /** Type ids with no hub price: left out of the total, never priced at zero silently. */
  unpriced: number[];
}

/** A pile priced at `ratePct` of the hub price. Each line floors, so the lines add to the total. */
export function priceQuote(items: readonly QuoteInput[], ratePct: number): PricedQuote {
  const lines: QuoteLine[] = [];
  const unpriced: number[] = [];
  for (const item of items) {
    if (item.unitPrice === null) {
      unpriced.push(item.typeId);
      continue;
    }
    lines.push({
      typeId: item.typeId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      // Rate is in tenths: work in whole numbers so 92.5% does not drift.
      // The small epsilon keeps float error (100 * 4.35 = 434.99999999999994) from costing an ISK.
      total: Math.floor((item.quantity * item.unitPrice * Math.round(ratePct * 10)) / 1000 + 1e-6),
    });
  }
  return { lines, total: lines.reduce((sum, line) => sum + line.total, 0), unpriced };
}

export const quoteExpiry = (quotedAt: number) => quotedAt + QUOTE_HOLD_MS;

/** A quote is held until the moment it expires. */
export const quoteIsHeld = (quote: { expiresAt: number }, now: number) => quote.expiresAt > now;

/** The hub's best price on the side a Request is a percent of; null when that side has no orders. */
export function unitPriceOf(
  aggregate: { sellMin: number | null; buyMax: number | null },
  basis: RateBasis
): number | null {
  return basis === 'buy' ? aggregate.buyMax : aggregate.sellMin;
}

/** One pasted type, with the SDE group the buy lines are matched against. */
export interface PastedItem extends BuybackItem {
  name: string;
  quantity: number;
}

/** A Member's Quote as held on their Pledge document. Only the lines and the hub prices behind the figure. */
export interface HeldQuote {
  lines: QuoteLine[];
  total: number;
  quotedAt: number;
  expiresAt: number;
  /** What the Request paid when this was priced, so a later edit to it marks the quote stale. */
  rate?: number;
  rateBasis?: RateBasis;
  hubId?: BuybackHubId;
}

/** Whether a quote still matches what the Request pays now. One from before the terms were recorded is trusted. */
export function quoteIsCurrent(
  quote: Pick<HeldQuote, 'rate' | 'rateBasis' | 'hubId'>,
  standing: Pick<StandingRequest, 'rate' | 'rateBasis' | 'hubId'>
): boolean {
  return (
    (quote.rate === undefined || quote.rate === standing.rate) &&
    (quote.rateBasis === undefined || quote.rateBasis === standing.rateBasis) &&
    (quote.hubId === undefined || quote.hubId === standing.hubId)
  );
}

export interface QuoteResult {
  quote: HeldQuote;
  /** Pasted types no buy line covers: not priced, never silently dropped. */
  notBought: { typeId: number; name: string }[];
  /** Covered types the hub has no price for on this side. */
  unpriced: { typeId: number; name: string }[];
  /** Priced types past the line cap. */
  dropped: number;
}

/**
 * A pasted pile priced for one standing Request: what its buy lines cover, at
 * its Rate, from the hub prices given. A type pasted twice counts once, its
 * quantities added. The Quote is held 14 days from `now`.
 */
export function buildQuote(
  pasted: readonly PastedItem[],
  standing: Pick<StandingRequest, 'buyLines' | 'rate' | 'rateBasis' | 'hubId'>,
  prices: ReadonlyMap<number, { sellMin: number | null; buyMax: number | null }>,
  now: number
): QuoteResult {
  const merged = new Map<number, PastedItem>();
  for (const item of pasted) {
    const seen = merged.get(item.typeId);
    merged.set(item.typeId, seen ? { ...seen, quantity: seen.quantity + item.quantity } : item);
  }
  const notBought: QuoteResult['notBought'] = [];
  const unpriced: QuoteResult['unpriced'] = [];
  const inputs: QuoteInput[] = [];
  for (const item of merged.values()) {
    if (!buybackCovers(standing.buyLines, item)) {
      notBought.push({ typeId: item.typeId, name: item.name });
      continue;
    }
    const aggregate = prices.get(item.typeId);
    const unitPrice = aggregate ? unitPriceOf(aggregate, standing.rateBasis) : null;
    if (unitPrice === null) unpriced.push({ typeId: item.typeId, name: item.name });
    inputs.push({ typeId: item.typeId, name: item.name, quantity: item.quantity, unitPrice });
  }
  const priced = priceQuote(inputs, standing.rate);
  const lines = priced.lines.slice(0, MAX_QUOTE_LINES);
  return {
    quote: {
      lines,
      total: lines.reduce((sum, line) => sum + line.total, 0),
      quotedAt: now,
      expiresAt: quoteExpiry(now),
      rate: standing.rate,
      rateBasis: standing.rateBasis,
      hubId: standing.hubId,
    },
    notBought,
    unpriced,
    dropped: priced.lines.length - lines.length,
  };
}

const isNum = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** A stored quote, or undefined when it does not read as one (a hand-edited or half-written document). */
export function readQuote(raw: unknown): HeldQuote | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const d = raw as Record<string, unknown>;
  if (!isNum(d.total) || d.total < 0 || !isNum(d.quotedAt) || !isNum(d.expiresAt)) return undefined;
  // A date past what `Date` can hold would throw when shown.
  if (!Number.isFinite(new Date(d.quotedAt).getTime())) return undefined;
  if (!Number.isFinite(new Date(d.expiresAt).getTime())) return undefined;
  if (!Array.isArray(d.lines) || d.lines.length === 0) return undefined;
  const lines: QuoteLine[] = [];
  for (const entry of d.lines) {
    const l = entry as Record<string, unknown> | null;
    if (
      typeof l !== 'object' ||
      l === null ||
      !isNum(l.typeId) ||
      !isNum(l.quantity) ||
      l.quantity <= 0 ||
      !isNum(l.unitPrice) ||
      l.unitPrice < 0 ||
      !isNum(l.total) ||
      l.total < 0
    ) {
      return undefined;
    }
    lines.push({
      typeId: l.typeId,
      name: String(l.name ?? ''),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      total: l.total,
    });
  }
  const rateBasis = RATE_BASES.find((b) => b === d.rateBasis);
  const hubId = BUYBACK_HUB_IDS.find((h) => h === d.hubId);
  return {
    lines,
    total: d.total,
    quotedAt: d.quotedAt,
    expiresAt: d.expiresAt,
    ...(isValidRate(d.rate) ? { rate: d.rate } : {}),
    ...(rateBasis ? { rateBasis } : {}),
    ...(hubId ? { hubId } : {}),
  };
}
