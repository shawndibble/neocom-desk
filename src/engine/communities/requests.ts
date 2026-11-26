import { isRecord } from '../guards';
import { parseLocalizedNumber } from '../numbers/parseLocalizedNumber';
import { DAY_MS } from '@/lib/age';
import {
  BUYBACK_HUB_IDS,
  RATE_BASES,
  isBuybackGroup,
  isValidRate,
  type BuybackLine,
  type HeldQuote,
  type StandingRequest,
} from './buyback';

export const MAX_LINES_PER_REQUEST = 50;
export const MAX_LOCATION_LENGTH = 100;
export const MAX_TERMS_LENGTH = 140;
export const MAX_PLEDGE_QUANTITY = 1_000_000_000_000;
export const STALE_PLEDGE_DAYS = 14;
export const MAX_REQUEST_MAILS_PER_DAY = 100;

export type RequestLineKind = 'item' | 'bpc' | 'bpo';

export interface RequestLine {
  typeId: number;
  name: string;
  quantity: number;
  kind: RequestLineKind;
  runs?: number;
  me?: number;
  te?: number;
}

export interface CommunityRequest {
  id: string;
  ownerUid: string;
  ownerName: string;
  location: string;
  terms: string;
  lines: RequestLine[];
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  closed: boolean;
  notify: RequestNotify;
  standing?: StandingRequest;
}

function readBuyLine(raw: unknown): BuybackLine | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === 'group')
    return isBuybackGroup(raw.group) ? { kind: 'group', group: raw.group } : null;
  if (raw.kind === 'type' && typeof raw.typeId === 'number') {
    return { kind: 'type', typeId: raw.typeId, name: String(raw.name ?? '') };
  }
  return null;
}

export function readStanding(d: Record<string, unknown>): StandingRequest | undefined {
  if (d.standing !== true) return undefined;
  const basis = RATE_BASES.find((b) => b === d.rateBasis);
  const hub = BUYBACK_HUB_IDS.find((h) => h === d.hubId);
  if (!isValidRate(d.rate) || !basis || !hub) return undefined;
  const buyLines = (Array.isArray(d.buyLines) ? d.buyLines : [])
    .map(readBuyLine)
    .filter((line): line is BuybackLine => line !== null);
  if (buyLines.length === 0) return undefined;
  return {
    rate: d.rate,
    rateBasis: basis,
    hubId: hub,
    buyerCharacterId: typeof d.buyerCharacterId === 'number' ? d.buyerCharacterId : null,
    buyLines,
  };
}

export interface PledgeEntry {
  quantity: number;
  delivered: number;
  contractIds?: readonly number[];
  manual?: number;
  auto?: number;
  through?: number;
}

export interface RequestPledge {
  uid: string;
  lines: Readonly<Record<number, PledgeEntry>>;
  quote?: HeldQuote;
  updatedAt: number;
}

export interface LineProgress {
  needed: number;
  pledged: number;
  delivered: number;
}

export function lineProgress(
  index: number,
  line: RequestLine,
  pledges: readonly RequestPledge[]
): LineProgress {
  let pledged = 0;
  let delivered = 0;
  for (const pledge of pledges) {
    const entry = pledge.lines[index];
    if (!entry) continue;
    pledged += entry.quantity;
    delivered += entry.delivered;
  }
  return { needed: line.quantity, pledged, delivered };
}

export interface RequestProgress {
  lines: number;
  pledgedLines: number;
  deliveredLines: number;
}

export function requestProgress(
  request: CommunityRequest,
  pledges: readonly RequestPledge[]
): RequestProgress {
  const progress = request.lines.map((line, i) => lineProgress(i, line, pledges));
  return {
    lines: progress.length,
    pledgedLines: progress.filter((p) => p.pledged >= p.needed).length,
    deliveredLines: progress.filter((p) => p.delivered >= p.needed).length,
  };
}

export type RequestStatus =
  'open' | 'pledged' | 'partDelivered' | 'delivered' | 'closed' | 'expired';

export function requestStatus(
  request: CommunityRequest,
  pledges: readonly RequestPledge[],
  now: number
): RequestStatus {
  if (request.closed) return 'closed';
  if (request.standing) return 'open';
  if (request.expiresAt <= now) return 'expired';
  const progress = request.lines.map((line, i) => lineProgress(i, line, pledges));
  if (progress.length > 0 && progress.every((p) => p.delivered >= p.needed)) return 'delivered';
  if (progress.some((p) => p.delivered > 0)) return 'partDelivered';
  if (progress.some((p) => p.pledged > 0)) return 'pledged';
  return 'open';
}

export function isOpenRequest(request: CommunityRequest, now: number): boolean {
  return !request.closed && (request.standing !== undefined || request.expiresAt > now);
}

export type RequestFilter = 'open' | 'mine' | 'canFill';

export interface SharedItem {
  typeId: number;
  runs: number;
}

export function libraryCovers(line: RequestLine, items: readonly SharedItem[]): boolean {
  if (line.kind === 'item') return false;
  return items.some(
    (item) => item.typeId === line.typeId && (line.kind !== 'bpo' || item.runs === -1)
  );
}

export function canFillRequest(request: CommunityRequest, items: readonly SharedItem[]): boolean {
  return request.lines.some((line) => libraryCovers(line, items));
}

export function filterRequests(
  requests: readonly CommunityRequest[],
  options: {
    filter: RequestFilter;
    query: string;
    myUid: string;
    now: number;
    sharedItems?: readonly SharedItem[];
  }
): CommunityRequest[] {
  const needle = options.query.trim().toLowerCase();
  return requests.filter((request) => {
    const inFilter =
      options.filter === 'mine'
        ? request.ownerUid === options.myUid
        : options.filter === 'canFill'
          ? isOpenRequest(request, options.now) &&
            request.ownerUid !== options.myUid &&
            canFillRequest(request, options.sharedItems ?? [])
          : isOpenRequest(request, options.now);
    if (!inFilter) return false;
    if (needle === '') return true;
    return [
      request.ownerName,
      request.location,
      request.terms,
      ...request.lines.map((l) => l.name),
      ...(request.standing?.buyLines.map((l) => (l.kind === 'type' ? l.name : l.group)) ?? []),
    ]
      .join('\n')
      .toLowerCase()
      .includes(needle);
  });
}

export function withinJumps(
  requests: readonly CommunityRequest[],
  maxJumps: number | null,
  jumpsOf: (request: CommunityRequest) => number | null
): { within: CommunityRequest[]; unmeasured: number } {
  if (maxJumps === null) return { within: [...requests], unmeasured: 0 };
  const within: CommunityRequest[] = [];
  let unmeasured = 0;
  for (const request of requests) {
    const jumps = jumpsOf(request);
    if (jumps === null) unmeasured += 1;
    else if (jumps <= maxJumps) within.push(request);
  }
  return { within, unmeasured };
}

export const lineKey = (line: Pick<RequestLine, 'typeId' | 'kind'>) =>
  `${line.typeId}:${line.kind}`;

const sameLine = (a: RequestLine, b: RequestLine) => lineKey(a) === lineKey(b);

export function mergeLines(
  existing: readonly RequestLine[],
  additions: readonly RequestLine[]
): { lines: RequestLine[]; dropped: number } {
  const lines = existing.map((line) => ({ ...line }));
  let dropped = 0;
  for (const add of additions) {
    const match = lines.find((line) => sameLine(line, add));
    if (match) {
      match.quantity += add.quantity;
    } else if (lines.length < MAX_LINES_PER_REQUEST) {
      lines.push({ ...add });
    } else {
      dropped += 1;
    }
  }
  return { lines, dropped };
}

export function parseQuantity(text: string): number | null {
  const value = parseLocalizedNumber(text);
  return value !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export const isBlueprintName = (name: string) => / Blueprint$/.test(name);

export const defaultKind = (name: string): RequestLineKind =>
  isBlueprintName(name) ? 'bpc' : 'item';

export type PledgesByRequest = ReadonlyMap<string, readonly RequestPledge[]>;

export function canPledge(request: CommunityRequest, myUid: string, now: number): boolean {
  return request.ownerUid !== myUid && isOpenRequest(request, now);
}

export function pledgeOverage(progress: LineProgress): number {
  return Math.max(0, progress.pledged - progress.needed);
}

export function defaultPledgeQuantity(progress: LineProgress, own: number | undefined): number {
  if (own !== undefined) return own;
  const uncovered = progress.needed - progress.pledged;
  return uncovered > 0 ? uncovered : progress.needed;
}

export function parsePledgeQuantity(text: string): number | null {
  const value = parseQuantity(text);
  return value !== null && value <= MAX_PLEDGE_QUANTITY ? value : null;
}

type PledgeLines = Readonly<Record<number, PledgeEntry>>;

export function withPledgeLine(lines: PledgeLines, index: number, quantity: number): PledgeLines {
  const before = lines[index];
  const manual = before?.manual !== undefined ? Math.min(before.manual, quantity) : undefined;
  return {
    ...lines,
    [index]: {
      quantity,
      delivered:
        before?.auto !== undefined
          ? Math.min(quantity, Math.max(before.auto, manual ?? 0))
          : Math.min(before?.delivered ?? 0, quantity),
      contractIds: [...(before?.contractIds ?? [])],
      ...(manual !== undefined ? { manual } : {}),
      ...(before?.auto !== undefined ? { auto: before.auto } : {}),
      ...(before?.through !== undefined ? { through: before.through } : {}),
    },
  };
}

export function withdrawPledgeLine(lines: PledgeLines, index: number): PledgeLines {
  const rest = { ...lines };
  delete rest[index];
  return rest;
}

export function isStalePledge(entry: PledgeEntry, updatedAt: number, now: number): boolean {
  return entry.delivered === 0 && now - updatedAt >= STALE_PLEDGE_DAYS * DAY_MS;
}

export interface MyPledgeRow {
  request: CommunityRequest;
  index: number;
  line: RequestLine;
  entry: PledgeEntry;
  updatedAt: number;
  stale: boolean;
}

export function myPledgeRows(
  requests: readonly CommunityRequest[],
  pledges: PledgesByRequest,
  myUid: string,
  now: number
): MyPledgeRow[] {
  const rows: MyPledgeRow[] = [];
  for (const request of requests) {
    if (!isOpenRequest(request, now)) continue;
    const mine = (pledges.get(request.id) ?? []).find((p) => p.uid === myUid);
    if (!mine) continue;
    request.lines.forEach((line, index) => {
      const entry = mine.lines[index];
      if (!entry) return;
      rows.push({
        request,
        index,
        line,
        entry,
        updatedAt: mine.updatedAt,
        stale: isStalePledge(entry, mine.updatedAt, now),
      });
    });
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt || a.index - b.index);
}

export function pledgedRequestLines(
  request: Pick<CommunityRequest, 'lines'>,
  pledged: Readonly<Record<number, { quantity: number }>>
): RequestLine[] {
  return request.lines.flatMap((line, index) => {
    const entry = pledged[index];
    return entry && entry.quantity > 0 ? [{ ...line, quantity: entry.quantity }] : [];
  });
}

export interface RequestNotify {
  app: boolean;
  mail: boolean;
}

export const DEFAULT_NOTIFY: RequestNotify = { app: true, mail: false };

export function readNotify(raw: unknown): RequestNotify {
  const d = isRecord(raw) ? raw : {};
  return {
    app: typeof d.app === 'boolean' ? d.app : DEFAULT_NOTIFY.app,
    mail: typeof d.mail === 'boolean' ? d.mail : DEFAULT_NOTIFY.mail,
  };
}

export function countNewRequests(
  requests: readonly CommunityRequest[],
  myUid: string,
  seenAt: number,
  now: number
): number {
  return requests.filter(
    (request) =>
      request.ownerUid !== myUid && request.createdAt > seenAt && isOpenRequest(request, now)
  ).length;
}
