import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_LINES_PER_REQUEST,
  MAX_LOCATION_LENGTH,
  MAX_OPEN_REQUESTS_PER_MEMBER,
  MAX_TERMS_LENGTH,
  REQUEST_LIFETIME_DAYS,
  lineKey,
  filterRequests,
  canFillRequest,
  withinJumps,
  defaultKind,
  isBlueprintName,
  isOpenRequest,
  lineProgress,
  mergeLines,
  parseQuantity,
  requestProgress,
  requestStatus,
  type CommunityRequest,
  type RequestLine,
  type RequestPledge,
} from './requests';

const DAY = 86_400_000;
const line = (typeId: number, quantity: number, over: Partial<RequestLine> = {}): RequestLine => ({
  typeId,
  name: `Item ${typeId}`,
  quantity,
  kind: 'item',
  ...over,
});
const request = (over: Partial<CommunityRequest> = {}): CommunityRequest => ({
  id: 'r1',
  ownerUid: 'char:1',
  ownerName: 'Aria Voss',
  location: 'Badivefi, Khanid',
  terms: 'Budget 300M',
  lines: [line(1, 100), line(2, 50)],
  createdAt: 0,
  lastActivityAt: 0,
  expiresAt: 30 * DAY,
  closed: false,
  ...over,
});
const pledge = (uid: string, lines: RequestPledge['lines']): RequestPledge => ({ uid, lines });

describe('lineProgress and requestProgress', () => {
  it('adds every Member’s Pledge and delivery on a line, and ignores other lines', () => {
    const pledges = [
      pledge('a', { 0: { quantity: 60, delivered: 10 } }),
      pledge('b', { 0: { quantity: 50, delivered: 0 }, 1: { quantity: 5, delivered: 0 } }),
    ];
    expect(lineProgress(0, line(1, 100), pledges)).toEqual({
      needed: 100,
      pledged: 110,
      delivered: 10,
    });
    expect(lineProgress(1, line(2, 50), pledges)).toEqual({ needed: 50, pledged: 5, delivered: 0 });
  });

  it('counts lines, not units, on the board', () => {
    const pledges = [
      pledge('a', { 0: { quantity: 100, delivered: 100 }, 1: { quantity: 1, delivered: 0 } }),
    ];
    expect(requestProgress(request(), pledges)).toEqual({
      lines: 2,
      pledgedLines: 1,
      deliveredLines: 1,
    });
    expect(requestProgress(request(), [])).toEqual({
      lines: 2,
      pledgedLines: 0,
      deliveredLines: 0,
    });
  });
});

describe('requestStatus', () => {
  const now = 10 * DAY;
  it('is Open with no Pledge', () => {
    expect(requestStatus(request(), [], now)).toBe('open');
  });
  it('is Pledged once anything is pledged, even over-pledged or short', () => {
    expect(requestStatus(request(), [pledge('a', { 0: { quantity: 1, delivered: 0 } })], now)).toBe(
      'pledged'
    );
  });
  it('is Part delivered once anything is delivered, and Delivered when every line is met', () => {
    const part = [pledge('a', { 0: { quantity: 100, delivered: 20 } })];
    expect(requestStatus(request(), part, now)).toBe('partDelivered');
    const all = [
      pledge('a', { 0: { quantity: 100, delivered: 100 } }),
      pledge('b', { 1: { quantity: 50, delivered: 50 } }),
    ];
    expect(requestStatus(request(), all, now)).toBe('delivered');
  });
  it('is Closed when the requester closed it, whatever the Pledges say', () => {
    const all = [pledge('a', { 0: { quantity: 100, delivered: 100 } })];
    expect(requestStatus(request({ closed: true }), all, now)).toBe('closed');
  });
  it('is Expired once past its expiry', () => {
    expect(requestStatus(request({ expiresAt: now }), [], now)).toBe('expired');
  });
});

describe('isOpenRequest', () => {
  it('needs neither closed nor expired', () => {
    expect(isOpenRequest(request(), 5 * DAY)).toBe(true);
    expect(isOpenRequest(request({ closed: true }), 5 * DAY)).toBe(false);
    expect(isOpenRequest(request({ expiresAt: 5 * DAY }), 5 * DAY)).toBe(false);
  });
});

describe('filterRequests', () => {
  const now = 5 * DAY;
  const mine = request({ id: 'm', ownerUid: 'me', ownerName: 'Kestrel Vane', location: 'Efa' });
  const closedMine = request({ id: 'cm', ownerUid: 'me', closed: true });
  const other = request({ id: 'o' });
  const expired = request({ id: 'x', expiresAt: now - 1 });
  const all = [other, mine, closedMine, expired];
  const ids = (rows: CommunityRequest[]) => rows.map((r) => r.id);

  it('Open lists open Requests only', () => {
    expect(ids(filterRequests(all, { filter: 'open', query: '', myUid: 'me', now }))).toEqual([
      'o',
      'm',
    ]);
  });

  it('Mine lists every Request of mine, closed ones included so they can be reopened', () => {
    expect(ids(filterRequests(all, { filter: 'mine', query: '', myUid: 'me', now }))).toEqual([
      'm',
      'cm',
    ]);
  });

  it('searches items, requester, location and terms, case-insensitively', () => {
    const rows = [
      request({ id: 'a', lines: [line(1, 1, { name: 'Reactive Metals' })] }),
      request({ id: 'b', ownerName: 'Bo Tanner', terms: '90% JBV' }),
      request({ id: 'c', location: 'Jita' }),
    ];
    const find = (query: string) =>
      ids(filterRequests(rows, { filter: 'open', query, myUid: 'me', now }));
    expect(find('reactive')).toEqual(['a']);
    expect(find('TANNER')).toEqual(['b']);
    expect(find('jbv')).toEqual(['b']);
    expect(find('jita')).toEqual(['c']);
    expect(find('  ')).toHaveLength(3);
  });
});

describe('mergeLines', () => {
  it('sums a repeated item and kind, and keeps the rest in order', () => {
    const merged = mergeLines([line(1, 5), line(2, 3)], [line(1, 7), line(3, 1)]);
    expect(merged.lines.map((l) => [l.typeId, l.quantity])).toEqual([
      [1, 12],
      [2, 3],
      [3, 1],
    ]);
    expect(merged.dropped).toBe(0);
  });

  it('keeps a BPC and a BPO of one type apart', () => {
    const merged = mergeLines([line(1, 1, { kind: 'bpc' })], [line(1, 1, { kind: 'bpo' })]);
    expect(merged.lines).toHaveLength(2);
  });

  it('stops at the line cap and reports what it dropped', () => {
    const existing = Array.from({ length: MAX_LINES_PER_REQUEST - 1 }, (_, i) => line(i + 1, 1));
    const merged = mergeLines(existing, [line(900, 1), line(901, 1)]);
    expect(merged.lines).toHaveLength(MAX_LINES_PER_REQUEST);
    expect(merged.dropped).toBe(1);
  });
});

describe('parseQuantity', () => {
  it.each([
    ['150000', 150000],
    ['1,500', 1500],
    [' 7 ', 7],
  ])('reads %s', (text, value) => {
    expect(parseQuantity(text)).toBe(value);
  });
  it.each(['', '0', '-3', '1.5', 'abc', '1e3'])('rejects %j', (text) => {
    expect(parseQuantity(text)).toBeNull();
  });
});

describe('blueprint lines', () => {
  it('recognises a blueprint by its name and starts it as a copy', () => {
    expect(isBlueprintName('Ishtar Blueprint')).toBe(true);
    expect(isBlueprintName('Blueprint Copy Kit')).toBe(false);
    expect(defaultKind('Ishtar Blueprint')).toBe('bpc');
    expect(defaultKind('Tritanium')).toBe('item');
  });
});

describe('constants shared with the callables', () => {
  // functions/ cannot be imported from the app, so the caps are written twice: pin them.
  const server = readFileSync('functions/src/communityRequests.ts', 'utf8');
  const constant = (name: string) => {
    const match = new RegExp(`export const ${name} = ([0-9_* ]+);`).exec(server);
    if (!match) throw new Error(`${name} not found in functions/src/communityRequests.ts`);
    return Function(`return ${match[1].replace(/_/g, '')}`)() as number;
  };

  it('matches the server caps and lifetime', () => {
    expect(MAX_LINES_PER_REQUEST).toBe(constant('MAX_LINES_PER_REQUEST'));
    expect(MAX_OPEN_REQUESTS_PER_MEMBER).toBe(constant('MAX_OPEN_REQUESTS_PER_MEMBER'));
    expect(MAX_LOCATION_LENGTH).toBe(constant('MAX_LOCATION_LENGTH'));
    expect(MAX_TERMS_LENGTH).toBe(constant('MAX_TERMS_LENGTH'));
    expect(REQUEST_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toBe(constant('REQUEST_LIFETIME_MS'));
  });

  it('matches the server line kinds', () => {
    expect(server).toContain("['item', 'bpc', 'bpo']");
  });
});

describe('lineKey', () => {
  it('tells a BPC from a BPO of one blueprint', () => {
    expect(lineKey({ typeId: 1, kind: 'bpc' })).not.toBe(lineKey({ typeId: 1, kind: 'bpo' }));
  });
});

describe('canFillRequest', () => {
  const shared = new Set([11534]);
  it('is true when a blueprint line is one the Member shares', () => {
    const bp = request({ lines: [line(1, 5), line(11534, 2, { kind: 'bpc' })] });
    expect(canFillRequest(bp, shared)).toBe(true);
    expect(canFillRequest(request({ lines: [line(11534, 2, { kind: 'bpo' })] }), shared)).toBe(
      true
    );
  });
  it('is false for other blueprints, and for a plain item that shares a type id', () => {
    expect(canFillRequest(request({ lines: [line(7, 2, { kind: 'bpc' })] }), shared)).toBe(false);
    expect(canFillRequest(request({ lines: [line(11534, 2)] }), shared)).toBe(false);
  });
});

describe('filterRequests: I can fill', () => {
  const now = 5 * DAY;
  const shared = new Set([11534]);
  const bp = (id: string, over: Partial<CommunityRequest> = {}) =>
    request({ id, lines: [line(11534, 1, { kind: 'bpc' })], ...over });
  const run = (rows: CommunityRequest[], sharedTypeIds: ReadonlySet<number> | null = shared) =>
    filterRequests(rows, {
      filter: 'canFill',
      query: '',
      myUid: 'me',
      now,
      sharedTypeIds: sharedTypeIds ?? undefined,
    }).map((r) => r.id);

  it('lists open Requests of others with a line for a shared blueprint', () => {
    const rows = [
      bp('a'),
      bp('own', { ownerUid: 'me' }),
      bp('closed', { closed: true }),
      bp('expired', { expiresAt: now - 1 }),
      request({ id: 'other' }),
    ];
    expect(run(rows)).toEqual(['a']);
  });

  it('lists nothing while the shared blueprints are unknown', () => {
    expect(run([bp('a')], null)).toEqual([]);
  });

  it('still applies the search', () => {
    const rows = [bp('a', { location: 'Jita' }), bp('b', { location: 'Efa' })];
    expect(
      filterRequests(rows, {
        filter: 'canFill',
        query: 'efa',
        myUid: 'me',
        now,
        sharedTypeIds: shared,
      }).map((r) => r.id)
    ).toEqual(['b']);
  });
});

describe('withinJumps', () => {
  const rows = [request({ id: 'near' }), request({ id: 'far' }), request({ id: 'free' })];
  const jumps = new Map<string, number | null>([
    ['near', 4],
    ['far', 12],
    ['free', null],
  ]);
  const jumpsOf = (r: CommunityRequest) => jumps.get(r.id) ?? null;
  const ids = (list: CommunityRequest[]) => list.map((r) => r.id);

  it('keeps Requests at or under the limit and counts those it cannot measure', () => {
    const result = withinJumps(rows, 5, jumpsOf);
    expect(ids(result.within)).toEqual(['near']);
    expect(result.unmeasured).toBe(1);
    expect(ids(withinJumps(rows, 12, jumpsOf).within)).toEqual(['near', 'far']);
  });

  it('is no filter at all without a limit', () => {
    const result = withinJumps(rows, null, jumpsOf);
    expect(ids(result.within)).toEqual(['near', 'far', 'free']);
    expect(result.unmeasured).toBe(0);
  });
});
