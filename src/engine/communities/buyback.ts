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

export type RateBasis = 'buy' | 'sell';

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
      total: Math.floor((item.quantity * item.unitPrice * Math.round(ratePct * 10)) / 1000),
    });
  }
  return { lines, total: lines.reduce((sum, line) => sum + line.total, 0), unpriced };
}

export const quoteExpiry = (quotedAt: number) => quotedAt + QUOTE_HOLD_MS;

/** A quote is held until the moment it expires. */
export const quoteIsHeld = (quote: { expiresAt: number }, now: number) => quote.expiresAt > now;
