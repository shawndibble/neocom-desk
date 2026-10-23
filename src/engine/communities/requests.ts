/**
 * Community Requests (issue #3807, ADR 0021): the pure rules of the board. A
 * Request is one Member's ask for items; its status is derived from Pledges
 * and deliveries, never stored. No Firestore, fetch or DOM here.
 *
 * A Pledge (issue #3808) is a Member's non-exclusive note of a quantity they
 * can provide on one line; their document keys its entries by line index. Each
 * entry also reserves `delivered` and `contractIds` for delivery marking
 * (#3809), which this ticket never writes beyond preserving them.
 */
import { isRecord } from '../guards';
import { parseLocalizedNumber } from '../numbers/parseLocalizedNumber';
import { DAY_MS } from '@/lib/age';
import {
  BUYBACK_HUB_IDS,
  RATE_BASES,
  isBuybackGroup,
  isValidRate,
  type BuybackLine,
  type StandingRequest,
} from './buyback';

/** Mirrors `functions/src/communityRequests.ts`, which enforces them. */
export const MAX_LINES_PER_REQUEST = 50;
export const MAX_LOCATION_LENGTH = 100;
export const MAX_TERMS_LENGTH = 140;
/** Far above any real stack; the rules enforce the same cap on a Pledge. */
export const MAX_PLEDGE_QUANTITY = 1_000_000_000_000;
/** A Pledge with nothing delivered this long after it was last written greys out. */
export const STALE_PLEDGE_DAYS = 14;
/** Pledge mails one Member may send a UTC day: mails, not lines. Apart from the 20 mail invites. */
export const MAX_REQUEST_MAILS_PER_DAY = 100;

export type RequestLineKind = 'item' | 'bpc' | 'bpo';

export interface RequestLine {
  typeId: number;
  name: string;
  quantity: number;
  kind: RequestLineKind;
  /** The ask on a BPC line; a delivery with other values still counts. */
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
  /** Set on a standing buyback Request: it carries no lines, never expires, and pays a rate. */
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

/** A stored standing Request's terms; undefined when the document is not one or does not read as one. */
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

/** One Member's quantity on one line: what they can provide, and what is marked delivered. */
export interface PledgeEntry {
  quantity: number;
  delivered: number;
  /** The contracts behind `delivered` (#3809); absent on a Pledge read from before that. */
  contractIds?: readonly number[];
  /**
   * An amount the Member typed because their app cannot read contracts (#3809).
   * `delivered` is the larger of this and what contracts show, so it survives
   * every automatic recompute and is never added to it.
   */
  manual?: number;
  /**
   * What contracts alone account for, kept as counted: it is not clamped to a
   * lowered `quantity`, so raising the Pledge back restores it (#3809). Absent
   * on an entry from before it was stored.
   */
  auto?: number;
  /** The latest finish time (ms) of any contract counted into `auto`. Absent likewise. */
  through?: number;
}

/** One Member's Pledges on a Request, keyed by line index. */
export interface RequestPledge {
  uid: string;
  lines: Readonly<Record<number, PledgeEntry>>;
  /** When the Member last wrote this document, ms since epoch. */
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
  /** Lines whose Pledges cover the need. */
  pledgedLines: number;
  /** Lines whose delivered quantity meets the need. */
  deliveredLines: number;
}

/** The board counts lines, never summed units: ore and BPC copies do not add. */
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

/** Closed is the requester's; Expired is the clock's; the rest come from Pledges and deliveries. */
export function requestStatus(
  request: CommunityRequest,
  pledges: readonly RequestPledge[],
  now: number
): RequestStatus {
  if (request.closed) return 'closed';
  // A standing Request is open until closed: its Pledges are quotes, which deliver nothing here.
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

/** One blueprint a Member shares: its type and runs (-1 is an original). */
export interface SharedItem {
  typeId: number;
  runs: number;
}

/**
 * Whether a Member's shared blueprints meet a line: a copy line by any copy or
 * original of the type, an original (BPO) line only by an original (runs -1).
 * Plain item lines are met by nothing a Member shares.
 */
export function libraryCovers(line: RequestLine, items: readonly SharedItem[]): boolean {
  if (line.kind === 'item') return false;
  return items.some(
    (item) => item.typeId === line.typeId && (line.kind !== 'bpo' || item.runs === -1)
  );
}

/** A line for a blueprint the Member shares with this Community, in the form the line asks for. */
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
    /** The blueprints this Member shares with the Community; undefined while not known. */
    sharedItems?: readonly SharedItem[];
  }
): CommunityRequest[] {
  const needle = options.query.trim().toLowerCase();
  return requests.filter((request) => {
    // Mine keeps closed and expired ones: that is where a requester reopens or extends.
    // I can fill is open Requests of others: a requester cannot Pledge on their own.
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

/**
 * The Requests within `maxJumps` of the pilot, and how many could not be
 * measured (no place the app can read, or none of it reachable by stargate).
 * Those are left out while a limit is set, and the caller says how many.
 * `maxJumps` null is no limit: everything stays and nothing counts as unmeasured.
 */
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

/** A line's identity: a BPC and a BPO of one blueprint are two lines. The server dedupes on it. */
export const lineKey = (line: Pick<RequestLine, 'typeId' | 'kind'>) =>
  `${line.typeId}:${line.kind}`;

const sameLine = (a: RequestLine, b: RequestLine) => lineKey(a) === lineKey(b);

/** Adds lines to a list, summing a repeated item and kind; stops at the line cap. */
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

/** A quantity typed into a field: a positive whole number, thousands separators allowed in either locale. */
export function parseQuantity(text: string): number | null {
  const value = parseLocalizedNumber(text);
  return value !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** A blueprint type's name ends "... Blueprint": those lines can ask for a copy or an original. */
export const isBlueprintName = (name: string) => / Blueprint$/.test(name);

/** The kind a line starts as: a copy for a blueprint (what a requester usually wants), else an item. */
export const defaultKind = (name: string): RequestLineKind =>
  isBlueprintName(name) ? 'bpc' : 'item';

/** Pledges per Request id, as the board and My pledges read them. */
export type PledgesByRequest = ReadonlyMap<string, readonly RequestPledge[]>;

/** Any Member but the requester may Pledge, while the Request is open. */
export function canPledge(request: CommunityRequest, myUid: string, now: number): boolean {
  return request.ownerUid !== myUid && isOpenRequest(request, now);
}

/** How far the Pledges overshoot the need; Pledges reserve nothing, so this never blocks. */
export function pledgeOverage(progress: LineProgress): number {
  return Math.max(0, progress.pledged - progress.needed);
}

/** What a line's quantity field starts as: the Member's own Pledge, else what is still uncovered. */
export function defaultPledgeQuantity(progress: LineProgress, own: number | undefined): number {
  if (own !== undefined) return own;
  const uncovered = progress.needed - progress.pledged;
  return uncovered > 0 ? uncovered : progress.needed;
}

/** A quantity typed for a Pledge: a positive whole number, no larger than the rules allow. */
export function parsePledgeQuantity(text: string): number | null {
  const value = parseQuantity(text);
  return value !== null && value <= MAX_PLEDGE_QUANTITY ? value : null;
}

type PledgeLines = Readonly<Record<number, PledgeEntry>>;

/** The lines with `quantity` Pledged on `index`; a repeat keeps what was delivered (up to the new quantity) and its contracts. */
export function withPledgeLine(lines: PledgeLines, index: number, quantity: number): PledgeLines {
  const before = lines[index];
  const manual = before?.manual !== undefined ? Math.min(before.manual, quantity) : undefined;
  return {
    ...lines,
    [index]: {
      quantity,
      // The rules bound these by the quantity, so lowering a Pledge lowers them
      // too; `auto` is kept as counted, so raising it back restores the figure.
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

/** The lines without `index`. */
export function withdrawPledgeLine(lines: PledgeLines, index: number): PledgeLines {
  const rest = { ...lines };
  delete rest[index];
  return rest;
}

/** Nothing delivered within the stale window since the Pledge was last written: it greys out, nothing releases. */
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

/** One Member's Pledges on open Requests, newest first, for the My pledges slide-out. */
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

/** The Request's lines a Pledge covers, in line order, each with the quantity Pledged (not the quantity asked). */
export function pledgedRequestLines(
  request: Pick<CommunityRequest, 'lines'>,
  pledged: Readonly<Record<number, { quantity: number }>>
): RequestLine[] {
  return request.lines.flatMap((line, index) => {
    const entry = pledged[index];
    return entry && entry.quantity > 0 ? [{ ...line, quantity: entry.quantity }] : [];
  });
}

/** How the requester hears about a Pledge on their Request: the bell, an in-game mail from the Pledger, both or neither. */
export interface RequestNotify {
  app: boolean;
  mail: boolean;
}

/** A Request stored before the choice existed reads as this. */
export const DEFAULT_NOTIFY: RequestNotify = { app: true, mail: false };

/** A stored `notify`; a missing or malformed flag takes its default. */
export function readNotify(raw: unknown): RequestNotify {
  const d = isRecord(raw) ? raw : {};
  return {
    app: typeof d.app === 'boolean' ? d.app : DEFAULT_NOTIFY.app,
    mail: typeof d.mail === 'boolean' ? d.mail : DEFAULT_NOTIFY.mail,
  };
}

/**
 * Open Requests from other Members posted after `seenAt` (when this Member
 * last looked at the Community's Requests): the number on the Communities nav
 * item.
 */
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
