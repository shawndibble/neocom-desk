/**
 * Community Requests (issue #3807, ADR 0021): the pure rules of the board. A
 * Request is one Member's ask for items; its status is derived from Pledges
 * and deliveries, never stored. No Firestore, fetch or DOM here.
 *
 * Pledges (issue #3808) are modelled now so the board's progress and status
 * already read them: a Member's Pledge document keys its entries by line
 * index. Until that ticket writes any, every list passed in is empty.
 */

/** Mirrors `functions/src/communityRequests.ts`, which enforces them. */
export const MAX_LINES_PER_REQUEST = 50;
export const MAX_OPEN_REQUESTS_PER_MEMBER = 10;
export const MAX_LOCATION_LENGTH = 100;
export const MAX_TERMS_LENGTH = 140;
export const REQUEST_LIFETIME_DAYS = 30;

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
}

/** One Member's quantity on one line: what they can provide, and what is marked delivered. */
export interface PledgeEntry {
  quantity: number;
  delivered: number;
}

/** One Member's Pledges on a Request, keyed by line index. */
export interface RequestPledge {
  uid: string;
  lines: Readonly<Record<number, PledgeEntry>>;
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
  if (request.expiresAt <= now) return 'expired';
  const progress = request.lines.map((line, i) => lineProgress(i, line, pledges));
  if (progress.length > 0 && progress.every((p) => p.delivered >= p.needed)) return 'delivered';
  if (progress.some((p) => p.delivered > 0)) return 'partDelivered';
  if (progress.some((p) => p.pledged > 0)) return 'pledged';
  return 'open';
}

export function isOpenRequest(request: CommunityRequest, now: number): boolean {
  return !request.closed && request.expiresAt > now;
}

export type RequestFilter = 'open' | 'mine';

export function filterRequests(
  requests: readonly CommunityRequest[],
  options: { filter: RequestFilter; query: string; myUid: string; now: number }
): CommunityRequest[] {
  const needle = options.query.trim().toLowerCase();
  return requests.filter((request) => {
    // Mine keeps closed and expired ones: that is where a requester reopens or extends.
    const inFilter =
      options.filter === 'mine'
        ? request.ownerUid === options.myUid
        : isOpenRequest(request, options.now);
    if (!inFilter) return false;
    if (needle === '') return true;
    return [request.ownerName, request.location, request.terms, ...request.lines.map((l) => l.name)]
      .join('\n')
      .toLowerCase()
      .includes(needle);
  });
}

const sameLine = (a: RequestLine, b: RequestLine) => a.typeId === b.typeId && a.kind === b.kind;

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

/** A quantity typed into a field: a positive whole number, thousands separators allowed. */
export function parseQuantity(text: string): number | null {
  const digits = text.replace(/,/g, '').trim();
  if (!/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** A blueprint type's name ends "... Blueprint": those lines can ask for a copy or an original. */
export const isBlueprintName = (name: string) => / Blueprint$/.test(name);

/** The kind a line starts as: a copy for a blueprint (what a requester usually wants), else an item. */
export const defaultKind = (name: string): RequestLineKind =>
  isBlueprintName(name) ? 'bpc' : 'item';
