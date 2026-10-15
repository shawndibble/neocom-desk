import { describe, expect, it } from 'vitest';
import {
  MAX_LINES_PER_REQUEST,
  MAX_OPEN_REQUESTS_PER_MEMBER,
  MAX_TERMS_LENGTH,
  REQUEST_LIFETIME_MS,
  decideExtend,
  decidePost,
  decideSetClosed,
  isOpenRequest,
  nextExpiry,
  parsePostRequestInput,
  parseRequestIdInput,
  parseSetClosedInput,
} from './communityRequests.js';

const line = { typeId: 16634, name: 'Reactive Metals', quantity: 350000 };
const post = (over: Record<string, unknown> = {}) => ({
  communityId: 'c1',
  lines: [line],
  ...over,
});

describe('parsePostRequestInput', () => {
  it('trims text, defaults location and terms to empty and the kind to item', () => {
    expect(parsePostRequestInput(post({ location: '  Badivefi ', terms: ' 90% JBV ' }))).toEqual({
      communityId: 'c1',
      location: 'Badivefi',
      terms: '90% JBV',
      lines: [{ ...line, kind: 'item' }],
    });
    expect(parsePostRequestInput(post()).location).toBe('');
  });

  it('keeps runs, ME and TE only on a BPC line', () => {
    const bpc = {
      typeId: 1,
      name: 'Ishtar Blueprint',
      quantity: 3,
      kind: 'bpc',
      runs: 5,
      me: 8,
      te: 2,
    };
    const bpo = { ...bpc, typeId: 2, kind: 'bpo' };
    const parsed = parsePostRequestInput(post({ lines: [bpc, bpo] }));
    expect(parsed.lines[0]).toMatchObject({ runs: 5, me: 8, te: 2 });
    expect(parsed.lines[1]).not.toHaveProperty('runs');
  });

  it.each([
    ['no lines', { lines: [] }],
    ['lines not a list', { lines: 'x' }],
    ['zero quantity', { lines: [{ ...line, quantity: 0 }] }],
    ['fractional quantity', { lines: [{ ...line, quantity: 1.5 }] }],
    ['unknown kind', { lines: [{ ...line, kind: 'ship' }] }],
    ['blank name', { lines: [{ ...line, name: ' ' }] }],
    ['ME out of range', { lines: [{ ...line, kind: 'bpc', me: 11 }] }],
    ['the same line twice', { lines: [line, line] }],
    ['terms too long', { terms: 'x'.repeat(MAX_TERMS_LENGTH + 1) }],
    ['non-text location', { location: 5 }],
    ['bad community id', { communityId: 'a/b' }],
  ])('rejects %s', (_label, over) => {
    expect(() => parsePostRequestInput(post(over))).toThrow();
  });

  it('rejects more than the line cap with a too-many-lines reason', () => {
    const lines = Array.from({ length: MAX_LINES_PER_REQUEST + 1 }, (_, i) => ({
      ...line,
      typeId: i + 1,
    }));
    expect(() => parsePostRequestInput(post({ lines }))).toThrow(/at most 50 lines/);
    expect(
      parsePostRequestInput(post({ lines: lines.slice(0, MAX_LINES_PER_REQUEST) })).lines
    ).toHaveLength(MAX_LINES_PER_REQUEST);
  });
});

describe('other inputs', () => {
  it('parses a request id and a closed flag', () => {
    expect(parseRequestIdInput({ communityId: 'c1', requestId: 'r1' })).toEqual({
      communityId: 'c1',
      requestId: 'r1',
    });
    expect(parseSetClosedInput({ communityId: 'c1', requestId: 'r1', closed: true }).closed).toBe(
      true
    );
    expect(() => parseSetClosedInput({ communityId: 'c1', requestId: 'r1' })).toThrow();
    expect(() => parseRequestIdInput({ communityId: 'c1' })).toThrow();
  });
});

describe('decisions', () => {
  it('caps the open Requests per Member', () => {
    expect(decidePost(MAX_OPEN_REQUESTS_PER_MEMBER - 1)).toBe('ok');
    expect(decidePost(MAX_OPEN_REQUESTS_PER_MEMBER)).toBe('too-many-open-requests');
  });

  it('counts a closed or expired Request as not open', () => {
    expect(isOpenRequest({ closed: false, expiresAt: 11 }, 10)).toBe(true);
    expect(isOpenRequest({ closed: true, expiresAt: 11 }, 10)).toBe(false);
    expect(isOpenRequest({ closed: false, expiresAt: 10 }, 10)).toBe(false);
  });

  it('lets only the owner extend, and not a closed Request', () => {
    const base = { exists: true, ownerUid: 'char:1', callerUid: 'char:1', closed: false };
    expect(decideExtend(base)).toBe('ok');
    expect(decideExtend({ ...base, exists: false })).toBe('not-found');
    expect(decideExtend({ ...base, callerUid: 'char:2' })).toBe('not-owner');
    expect(decideExtend({ ...base, closed: true })).toBe('closed');
  });

  it('lets only the owner close or reopen, and holds a reopen to the cap', () => {
    const base = {
      exists: true,
      ownerUid: 'char:1',
      callerUid: 'char:1',
      closed: true,
      wantClosed: false,
      openCount: 0,
    };
    expect(decideSetClosed(base)).toBe('ok');
    expect(decideSetClosed({ ...base, callerUid: 'char:2' })).toBe('not-owner');
    expect(decideSetClosed({ ...base, exists: false })).toBe('not-found');
    expect(decideSetClosed({ ...base, openCount: MAX_OPEN_REQUESTS_PER_MEMBER })).toBe(
      'too-many-open-requests'
    );
    expect(
      decideSetClosed({
        ...base,
        closed: false,
        wantClosed: true,
        openCount: MAX_OPEN_REQUESTS_PER_MEMBER,
      })
    ).toBe('ok');
  });

  it('extends 30 days from now, never shortening a later expiry', () => {
    expect(nextExpiry(1000, 5)).toBe(1000 + REQUEST_LIFETIME_MS);
    const far = 1000 + 2 * REQUEST_LIFETIME_MS;
    expect(nextExpiry(1000, far)).toBe(far);
  });
});
