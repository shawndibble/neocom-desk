import { describe, expect, it } from 'vitest';
import {
  MAX_LINES_PER_REQUEST,
  filterRequests,
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
