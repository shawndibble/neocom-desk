import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_LINES_PER_REQUEST,
  MAX_LOCATION_LENGTH,
  MAX_PLEDGE_QUANTITY,
  MAX_REQUEST_MAILS_PER_DAY,
  MAX_TERMS_LENGTH,
  STALE_PLEDGE_DAYS,
  lineKey,
  filterRequests,
  canFillRequest,
  withinJumps,
  defaultKind,
  isBlueprintName,
  isOpenRequest,
  canPledge,
  defaultPledgeQuantity,
  isStalePledge,
  lineProgress,
  mergeLines,
  myPledgeRows,
  parsePledgeQuantity,
  pledgeOverage,
  withdrawPledgeLine,
  withPledgeLine,
  countNewRequests,
  DEFAULT_NOTIFY,
  pledgedRequestLines,
  readNotify,
  parseQuantity,
  requestProgress,
  requestStatus,
  type CommunityRequest,
  type RequestLine,
  type RequestPledge,
  type SharedItem,
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
  notify: { app: true, mail: false },
  ...over,
});
const pledge = (uid: string, lines: RequestPledge['lines'], updatedAt = 0): RequestPledge => ({
  uid,
  lines,
  updatedAt,
});

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

  it('matches the server caps', () => {
    expect(MAX_LINES_PER_REQUEST).toBe(constant('MAX_LINES_PER_REQUEST'));
    expect(MAX_LOCATION_LENGTH).toBe(constant('MAX_LOCATION_LENGTH'));
    expect(MAX_TERMS_LENGTH).toBe(constant('MAX_TERMS_LENGTH'));
    expect(MAX_REQUEST_MAILS_PER_DAY).toBe(constant('MAX_REQUEST_MAILS_PER_DAY'));
  });

  it('pins the open-Request cap and lifetime the app words for Members', () => {
    // Neither is an app constant any more (a Request carries its own expiresAt); the FAQ and
    // the Communities copy state them, so a server change must come through here.
    expect(constant('MAX_OPEN_REQUESTS_PER_MEMBER')).toBe(10);
    expect(constant('REQUEST_LIFETIME_MS')).toBe(30 * DAY);
  });

  it('matches the server default notification choice', () => {
    const match =
      /export const DEFAULT_NOTIFY: RequestNotify = \{ app: (true|false), mail: (true|false) \};/.exec(
        server
      );
    if (!match) throw new Error('DEFAULT_NOTIFY not found in functions/src/communityRequests.ts');
    expect(DEFAULT_NOTIFY).toEqual({ app: match[1] === 'true', mail: match[2] === 'true' });
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
  const shared = [{ typeId: 11534, runs: -1 }];
  const onlyCopy = [{ typeId: 11534, runs: 10 }];
  it('is true when a blueprint line is one the Member shares', () => {
    const bp = request({ lines: [line(1, 5), line(11534, 2, { kind: 'bpc' })] });
    expect(canFillRequest(bp, shared)).toBe(true);
    expect(canFillRequest(bp, onlyCopy)).toBe(true);
    expect(canFillRequest(request({ lines: [line(11534, 2, { kind: 'bpo' })] }), shared)).toBe(
      true
    );
  });
  it('needs an original shared to fill a BPO line, as mail recipients do', () => {
    const bpo = request({ lines: [line(11534, 2, { kind: 'bpo' })] });
    expect(canFillRequest(bpo, onlyCopy)).toBe(false);
  });
  it('is false for other blueprints, and for a plain item that shares a type id', () => {
    expect(canFillRequest(request({ lines: [line(7, 2, { kind: 'bpc' })] }), shared)).toBe(false);
    expect(canFillRequest(request({ lines: [line(11534, 2)] }), shared)).toBe(false);
  });
});

describe('filterRequests: I can fill', () => {
  const now = 5 * DAY;
  const shared = [{ typeId: 11534, runs: -1 }];
  const bp = (id: string, over: Partial<CommunityRequest> = {}) =>
    request({ id, lines: [line(11534, 1, { kind: 'bpc' })], ...over });
  const run = (rows: CommunityRequest[], sharedItems: readonly SharedItem[] | null = shared) =>
    filterRequests(rows, {
      filter: 'canFill',
      query: '',
      myUid: 'me',
      now,
      sharedItems: sharedItems ?? undefined,
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
        sharedItems: shared,
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

describe('canPledge', () => {
  const now = 5 * DAY;
  it('lets a Member Pledge on an open Request that is not theirs', () => {
    expect(canPledge(request(), 'char:2', now)).toBe(true);
  });
  it('never lets the requester Pledge on their own Request', () => {
    expect(canPledge(request(), 'char:1', now)).toBe(false);
  });
  it('stops once the Request is closed or expired', () => {
    expect(canPledge(request({ closed: true }), 'char:2', now)).toBe(false);
    expect(canPledge(request({ expiresAt: now }), 'char:2', now)).toBe(false);
  });
});

describe('pledgeOverage', () => {
  it('is the amount pledged beyond the need, else zero', () => {
    expect(pledgeOverage({ needed: 350, pledged: 410, delivered: 120 })).toBe(60);
    expect(pledgeOverage({ needed: 350, pledged: 350, delivered: 0 })).toBe(0);
    expect(pledgeOverage({ needed: 350, pledged: 90, delivered: 0 })).toBe(0);
  });
});

describe('defaultPledgeQuantity', () => {
  it('starts at the member’s own Pledge', () => {
    expect(defaultPledgeQuantity({ needed: 350, pledged: 410, delivered: 0 }, 150)).toBe(150);
  });
  it('else offers what is still uncovered', () => {
    expect(defaultPledgeQuantity({ needed: 300, pledged: 90, delivered: 0 }, undefined)).toBe(210);
  });
  it('else offers the whole need once the line is covered', () => {
    expect(defaultPledgeQuantity({ needed: 300, pledged: 400, delivered: 0 }, undefined)).toBe(300);
  });
});

describe('parsePledgeQuantity', () => {
  it('reads a positive whole number up to the cap', () => {
    expect(parsePledgeQuantity('1,500')).toBe(1500);
    expect(parsePledgeQuantity(String(MAX_PLEDGE_QUANTITY))).toBe(MAX_PLEDGE_QUANTITY);
  });
  it('rejects zero, junk and anything over the cap', () => {
    expect(parsePledgeQuantity('0')).toBeNull();
    expect(parsePledgeQuantity('x')).toBeNull();
    expect(parsePledgeQuantity(String(MAX_PLEDGE_QUANTITY + 1))).toBeNull();
  });
});

describe('withPledgeLine and withdrawPledgeLine', () => {
  it('adds a line with nothing delivered and no contracts', () => {
    expect(withPledgeLine({}, 2, 40)).toEqual({
      2: { quantity: 40, delivered: 0, contractIds: [] },
    });
  });
  it('updating keeps what was delivered and the contracts behind it', () => {
    const before = { 0: { quantity: 10, delivered: 4, contractIds: [77] } };
    expect(withPledgeLine(before, 0, 25)).toEqual({
      0: { quantity: 25, delivered: 4, contractIds: [77] },
    });
    expect(before[0].quantity).toBe(10);
  });
  it('updating keeps a typed delivered amount', () => {
    const before = { 0: { quantity: 10, delivered: 4, contractIds: [], manual: 4 } };
    expect(withPledgeLine(before, 0, 25)[0]).toEqual({
      quantity: 25,
      delivered: 4,
      contractIds: [],
      manual: 4,
    });
  });
  it('lowering a Pledge lowers what was delivered and typed with it', () => {
    const before = { 0: { quantity: 10, delivered: 8, contractIds: [], manual: 8 } };
    expect(withPledgeLine(before, 0, 5)[0]).toEqual({
      quantity: 5,
      delivered: 5,
      contractIds: [],
      manual: 5,
    });
  });
  it('withdrawing drops one line and leaves the others', () => {
    const before = {
      0: { quantity: 10, delivered: 0, contractIds: [] },
      1: { quantity: 5, delivered: 0, contractIds: [] },
    };
    expect(withdrawPledgeLine(before, 0)).toEqual({
      1: { quantity: 5, delivered: 0, contractIds: [] },
    });
  });
});

describe('isStalePledge', () => {
  const entry = (delivered: number) => ({ quantity: 10, delivered });
  const stamp = 3 * DAY;
  it('is stale after 14 days with nothing delivered', () => {
    expect(STALE_PLEDGE_DAYS).toBe(14);
    expect(isStalePledge(entry(0), stamp, stamp + 14 * DAY)).toBe(true);
  });
  it('is fresh before 14 days', () => {
    expect(isStalePledge(entry(0), stamp, stamp + 14 * DAY - 1)).toBe(false);
  });
  it('is never stale once anything is delivered', () => {
    expect(isStalePledge(entry(1), stamp, stamp + 60 * DAY)).toBe(false);
  });
});

describe('myPledgeRows', () => {
  const now = 20 * DAY;
  it('lists my Pledges across Requests, newest Pledge first, with stale ones flagged', () => {
    const a = request({ id: 'a', lines: [line(1, 100), line(2, 50)] });
    const b = request({ id: 'b', ownerUid: 'char:3', lines: [line(3, 10)] });
    const board = new Map([
      [
        'a',
        [
          pledge('me', { 1: { quantity: 5, delivered: 0 } }, 2 * DAY),
          pledge('other', { 0: { quantity: 9, delivered: 0 } }, 19 * DAY),
        ],
      ],
      ['b', [pledge('me', { 0: { quantity: 4, delivered: 4 } }, 19 * DAY)]],
    ]);
    const rows = myPledgeRows([a, b], board, 'me', now);
    expect(rows.map((r) => [r.request.id, r.index, r.stale])).toEqual([
      ['b', 0, false],
      ['a', 1, true],
    ]);
  });
  it('leaves out closed and expired Requests', () => {
    const closed = request({ id: 'c', closed: true });
    const board = new Map([['c', [pledge('me', { 0: { quantity: 1, delivered: 0 } })]]]);
    expect(myPledgeRows([closed], board, 'me', now)).toEqual([]);
  });
});

describe('pledge constants shared with the rules', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  it('pins the quantity cap and the line cap in firestore.rules', () => {
    expect(rules).toContain(`<= ${MAX_PLEDGE_QUANTITY}`);
    expect(rules.match(/'(\d+)'/g)).toContain(`'${MAX_LINES_PER_REQUEST - 1}'`);
  });
});

describe('request notification choice', () => {
  it('reads a stored choice, and a legacy Request without one as the app only', () => {
    expect(DEFAULT_NOTIFY).toEqual({ app: true, mail: false });
    expect(readNotify(undefined)).toEqual({ app: true, mail: false });
    expect(readNotify(null)).toEqual({ app: true, mail: false });
    expect(readNotify({ app: false, mail: true })).toEqual({ app: false, mail: true });
    expect(readNotify({ app: false, mail: false })).toEqual({ app: false, mail: false });
  });

  it('falls back per flag when a stored one is not a boolean', () => {
    expect(readNotify({ app: 'x', mail: 1 })).toEqual({ app: true, mail: false });
    expect(readNotify('mail')).toEqual({ app: true, mail: false });
  });
});

describe('countNewRequests', () => {
  const now = 10 * DAY;
  const base = (over: Partial<CommunityRequest>): CommunityRequest => ({
    id: 'r',
    ownerUid: 'char:2',
    ownerName: 'Two',
    location: '',
    terms: '',
    lines: [line(1, 1)],
    createdAt: 9 * DAY,
    lastActivityAt: 9 * DAY,
    expiresAt: now + DAY,
    closed: false,
    notify: { app: true, mail: false },
    ...over,
  });

  it('counts open Requests from others posted after the last look', () => {
    const requests = [
      base({ id: 'new' }),
      base({ id: 'old', createdAt: 5 * DAY }),
      base({ id: 'mine', ownerUid: 'char:1' }),
      base({ id: 'closed', closed: true }),
      base({ id: 'expired', expiresAt: now - 1 }),
    ];
    expect(countNewRequests(requests, 'char:1', 8 * DAY, now)).toBe(1);
    expect(countNewRequests(requests, 'char:1', 0, now)).toBe(2);
    expect(countNewRequests([], 'char:1', 0, now)).toBe(0);
  });
});

describe('pledgedRequestLines', () => {
  const request = { lines: [line(1, 100), line(2, 5, { kind: 'bpc' }), line(3, 7)] };

  it('lists the lines a Pledge covers with the Pledged quantity, in line order', () => {
    expect(
      pledgedRequestLines(request, { 2: { quantity: 4 }, 0: { quantity: 60 } }).map((l) => [
        l.typeId,
        l.quantity,
        l.kind,
      ])
    ).toEqual([
      [1, 60, 'item'],
      [3, 4, 'item'],
    ]);
  });

  it('skips lines with no Pledge and a Pledge past the Request’s lines', () => {
    expect(pledgedRequestLines(request, { 9: { quantity: 1 } })).toEqual([]);
    expect(pledgedRequestLines(request, { 1: { quantity: 0 } })).toEqual([]);
  });
});
