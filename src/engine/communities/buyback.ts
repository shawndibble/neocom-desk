import { DAY_MS } from '@/lib/age';

export const MIN_RATE = 1;
export const MAX_RATE = 200;
export const QUOTE_HOLD_MS = 14 * DAY_MS;
export const MAX_QUOTE_LINES = 50;
export const MAX_BUY_LINES = 50;

export const RATE_BASES = ['buy', 'sell'] as const;
export type RateBasis = (typeof RATE_BASES)[number];

export const BUYBACK_HUB_IDS = ['jita', 'amarr', 'dodixie', 'rens', 'hek'] as const;
export type BuybackHubId = (typeof BUYBACK_HUB_IDS)[number];

export function isValidRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_RATE &&
    value <= MAX_RATE &&
    Math.abs(value * 10 - Math.round(value * 10)) < 1e-9
  );
}

export function parseRate(text: string): number | null {
  const match = /^(\d{1,3}(?:[.,]\d)?)\s*%?$/.exec(text.trim());
  if (!match) return null;
  const rate = Number(match[1].replace(',', '.'));
  return isValidRate(rate) ? rate : null;
}

export interface BuybackItem {
  typeId: number;
  groupId: number | null;
  categoryId: number | null;
}

interface GroupTable {
  categoryIds: readonly number[];
  groupIds: readonly number[];
}

export const BUYBACK_GROUPS = {
  ore: { categoryIds: [25], groupIds: [] },
  ice: { categoryIds: [], groupIds: [465] },
  minerals: { categoryIds: [], groupIds: [18] },
  gas: { categoryIds: [], groupIds: [711] },
  pi: { categoryIds: [42, 43], groupIds: [] },
  salvage: { categoryIds: [], groupIds: [754] },
} as const satisfies Record<string, GroupTable>;

export type BuybackGroup = keyof typeof BUYBACK_GROUPS;

export const BUYBACK_GROUP_KEYS = Object.keys(BUYBACK_GROUPS) as BuybackGroup[];

export const isBuybackGroup = (value: unknown): value is BuybackGroup =>
  typeof value === 'string' && Object.hasOwn(BUYBACK_GROUPS, value);

export type BuybackLine =
  { kind: 'type'; typeId: number; name: string } | { kind: 'group'; group: BuybackGroup };

export interface StandingRequest {
  rate: number;
  rateBasis: RateBasis;
  hubId: BuybackHubId;
  buyerCharacterId: number | null;
  buyLines: BuybackLine[];
}

export const buybackLineKey = (line: BuybackLine) =>
  line.kind === 'type' ? `type:${line.typeId}` : `group:${line.group}`;

export function buybackLineCovers(line: BuybackLine, item: BuybackItem): boolean {
  if (line.kind === 'type') return line.typeId === item.typeId;
  const { categoryIds, groupIds } = BUYBACK_GROUPS[line.group];
  if (line.group === 'ore' && item.groupId === 465) return false;
  return (
    (item.groupId !== null && groupIds.some((id) => id === item.groupId)) ||
    (item.categoryId !== null && categoryIds.some((id) => id === item.categoryId))
  );
}

export const buybackCovers = (lines: readonly BuybackLine[], item: BuybackItem) =>
  lines.some((line) => buybackLineCovers(line, item));

export interface QuoteInput {
  typeId: number;
  name: string;
  quantity: number;
  unitPrice: number | null;
}

export interface QuoteLine {
  typeId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface PricedQuote {
  lines: QuoteLine[];
  total: number;
  unpriced: number[];
}

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
      total: Math.floor((item.quantity * item.unitPrice * Math.round(ratePct * 10)) / 1000 + 1e-6),
    });
  }
  return { lines, total: lines.reduce((sum, line) => sum + line.total, 0), unpriced };
}

export const quoteExpiry = (quotedAt: number) => quotedAt + QUOTE_HOLD_MS;

export const quoteIsHeld = (quote: { expiresAt: number }, now: number) => quote.expiresAt > now;

export function unitPriceOf(
  aggregate: { sellMin: number | null; buyMax: number | null },
  basis: RateBasis
): number | null {
  return basis === 'buy' ? aggregate.buyMax : aggregate.sellMin;
}

export interface PastedItem extends BuybackItem {
  name: string;
  quantity: number;
}

export type QuoteContractStatus =
  'outstanding' | 'inProgress' | 'finished' | 'expired' | 'rejected';
export const QUOTE_CONTRACT_STATUSES: readonly QuoteContractStatus[] = [
  'outstanding',
  'inProgress',
  'finished',
  'expired',
  'rejected',
];

export interface QuoteLinkRef {
  contractId: number;
  status: QuoteContractStatus;
}

export interface HeldQuote {
  lines: QuoteLine[];
  total: number;
  quotedAt: number;
  expiresAt: number;
  rate?: number;
  rateBasis?: RateBasis;
  hubId?: BuybackHubId;
  links?: QuoteLinkRef[];
}

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
  notBought: { typeId: number; name: string }[];
  unpriced: { typeId: number; name: string }[];
  dropped: number;
}

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

export function readQuote(raw: unknown): HeldQuote | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const d = raw as Record<string, unknown>;
  if (!isNum(d.total) || d.total < 0 || !isNum(d.quotedAt) || !isNum(d.expiresAt)) return undefined;
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
  const links = Array.isArray(d.links)
    ? d.links.flatMap((entry): QuoteLinkRef[] => {
        const l = entry as Record<string, unknown> | null;
        const status = QUOTE_CONTRACT_STATUSES.find((s) => s === l?.status);
        return l && isNum(l.contractId) && l.contractId > 0 && status
          ? [{ contractId: l.contractId, status }]
          : [];
      })
    : [];
  return {
    lines,
    total: d.total,
    quotedAt: d.quotedAt,
    expiresAt: d.expiresAt,
    ...(isValidRate(d.rate) ? { rate: d.rate } : {}),
    ...(rateBasis ? { rateBasis } : {}),
    ...(hubId ? { hubId } : {}),
    ...(links.length > 0 ? { links } : {}),
  };
}
