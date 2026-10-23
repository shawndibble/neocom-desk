import { describe, expect, it } from 'vitest';
import {
  MAIL_MAX_ATTEMPTS_PER_TARGET,
  MAIL_RESERVATION_STALE_MS,
  MAX_MAIL_INVITES_PER_DAY,
} from './communities.js';
import {
  MAX_LINES_PER_REQUEST,
  MAX_REQUEST_MAILS_PER_DAY,
  MAX_OPEN_REQUESTS_PER_MEMBER,
  MAX_TERMS_LENGTH,
  REQUEST_LIFETIME_MS,
  CLOSED_RETENTION_MS,
  EXPIRED_RETENTION_MS,
  decideEdit,
  decideExtend,
  parseEditRequestInput,
  sameLineSlots,
  decideRequestMail,
  decideRequestSweep,
  parseRemovePledgeInput,
  decidePost,
  decideSetClosed,
  isOpenRequest,
  nextExpiry,
  parsePostRequestInput,
  parseNotify,
  decidePledgeMail,
  pledgedLineCount,
  characterIdOfUid,
  parseRequestIdInput,
  parseSetClosedInput,
  MAX_BUY_LINES,
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
      notify: { app: true, mail: false },
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

  it('defaults the notification choice to the app only and keeps one that is given', () => {
    expect(parsePostRequestInput(post()).notify).toEqual({ app: true, mail: false });
    expect(parsePostRequestInput(post({ notify: { app: false, mail: true } })).notify).toEqual({
      app: false,
      mail: true,
    });
    expect(parsePostRequestInput(post({ notify: { app: false, mail: false } })).notify).toEqual({
      app: false,
      mail: false,
    });
  });

  it.each([
    ['not an object', 'mail'],
    ['a string flag', { app: 'yes', mail: false }],
    ['a missing flag', { app: true }],
    ['an extra key', { app: true, mail: false, sms: true }],
  ])('rejects a notify that is %s', (_label, notify) => {
    expect(() => parsePostRequestInput(post({ notify }))).toThrow();
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
    const base = {
      exists: true,
      ownerUid: 'char:1',
      callerUid: 'char:1',
      closed: false,
      isOpen: true,
      openCount: 0,
    };
    expect(decideExtend(base)).toBe('ok');
    expect(decideExtend({ ...base, exists: false })).toBe('not-found');
    expect(decideExtend({ ...base, callerUid: 'char:2' })).toBe('not-owner');
    expect(decideExtend({ ...base, closed: true, isOpen: false })).toBe('closed');
  });

  it('holds extending an expired Request to the open cap, but not one still open', () => {
    const atCap = {
      exists: true,
      ownerUid: 'char:1',
      callerUid: 'char:1',
      closed: false,
      openCount: MAX_OPEN_REQUESTS_PER_MEMBER,
    };
    expect(decideExtend({ ...atCap, isOpen: false })).toBe('too-many-open-requests');
    expect(decideExtend({ ...atCap, isOpen: true })).toBe('ok');
    expect(
      decideExtend({ ...atCap, isOpen: false, openCount: MAX_OPEN_REQUESTS_PER_MEMBER - 1 })
    ).toBe('ok');
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

describe('Pledge mail', () => {
  const NOW = 1_000_000;
  const DAY = '2026-10-14';
  const reserved = (
    over: Partial<{ sentAt: number | null; attempts: number; day: string }> = {}
  ) => ({
    sentAt: null,
    reservedAt: NOW,
    attempts: 1,
    day: DAY,
    ...over,
  });

  it('is capped at 100 mails a day, separate from the 20 invites', () => {
    expect(MAX_REQUEST_MAILS_PER_DAY).toBe(100);
    expect(MAX_MAIL_INVITES_PER_DAY).toBe(20);
  });

  it('reads a stored notify, a legacy Request without one meaning the app only', () => {
    expect(parseNotify(undefined)).toEqual({ app: true, mail: false });
    expect(parseNotify({ app: false, mail: true })).toEqual({ app: false, mail: true });
  });

  it('counts the lines a Pledge document has quantity on', () => {
    expect(pledgedLineCount(undefined)).toBe(0);
    expect(pledgedLineCount({ 0: { quantity: 3 }, 2: { quantity: 0 }, 3: {} })).toBe(1);
  });

  it('reads a Character id from a uid', () => {
    expect(characterIdOfUid('char:93000001')).toBe(93000001);
    expect(characterIdOfUid('char:')).toBeNull();
    expect(characterIdOfUid('abc')).toBeNull();
  });

  it('lets a Member mail only the owner of an open Request that asked for mail, after Pledging', () => {
    const ok = {
      exists: true,
      ownerUid: 'char:1',
      callerUid: 'char:2',
      isOpen: true,
      notifyMail: true,
      pledgedLines: 1,
    };
    expect(decidePledgeMail(ok)).toBe('ok');
    expect(decidePledgeMail({ ...ok, exists: false })).toBe('not-found');
    expect(decidePledgeMail({ ...ok, callerUid: 'char:1' })).toBe('own-request');
    expect(decidePledgeMail({ ...ok, isOpen: false })).toBe('closed');
    expect(decidePledgeMail({ ...ok, notifyMail: false })).toBe('mail-off');
    expect(decidePledgeMail({ ...ok, pledgedLines: 0 })).toBe('no-pledge');
  });

  it('allows up to the daily cap, counting mails', () => {
    const state = { existing: null, now: NOW };
    expect(
      decideRequestMail({ ...state, day: DAY, dailyCount: MAX_REQUEST_MAILS_PER_DAY - 1 })
    ).toBe('ok');
    expect(decideRequestMail({ ...state, day: DAY, dailyCount: MAX_REQUEST_MAILS_PER_DAY })).toBe(
      'daily-cap'
    );
    // The invite count is not the Request-mail count.
    expect(decideRequestMail({ ...state, day: DAY, dailyCount: MAX_MAIL_INVITES_PER_DAY })).toBe(
      'ok'
    );
  });

  it('reports a repeat recipient before the cap', () => {
    expect(
      decideRequestMail({
        dailyCount: MAX_REQUEST_MAILS_PER_DAY,
        existing: reserved({ sentAt: 1 }),
        now: NOW,
        day: DAY,
      })
    ).toBe('already-mailed');
  });

  it('retakes a stale unconfirmed reservation a few times, never a sent one', () => {
    const later = NOW + MAIL_RESERVATION_STALE_MS;
    const at = (existing: ReturnType<typeof reserved>, now: number) =>
      decideRequestMail({ dailyCount: 5, existing, now, day: DAY });
    expect(at(reserved(), NOW + 1000)).toBe('already-mailed');
    expect(at(reserved(), later)).toBe('retake');
    expect(at(reserved({ attempts: MAIL_MAX_ATTEMPTS_PER_TARGET }), later)).toBe('already-mailed');
    expect(at(reserved({ sentAt: 1 }), later)).toBe('already-mailed');
  });

  it('retakes free on the same day, charged and capped on a later one', () => {
    const later = NOW + MAIL_RESERVATION_STALE_MS;
    const stale = reserved({ day: '2026-10-13' });
    const at = (existing: ReturnType<typeof reserved>, dailyCount: number) =>
      decideRequestMail({ dailyCount, existing, now: later, day: DAY });
    expect(at(reserved(), MAX_REQUEST_MAILS_PER_DAY)).toBe('retake');
    expect(at(stale, 5)).toBe('retake-charged');
    expect(at(stale, MAX_REQUEST_MAILS_PER_DAY - 1)).toBe('retake-charged');
    expect(at(stale, MAX_REQUEST_MAILS_PER_DAY)).toBe('daily-cap');
  });

  it('stops retaking a recipient after the attempts allowed, on any day', () => {
    const later = NOW + MAIL_RESERVATION_STALE_MS;
    for (const day of [DAY, '2026-10-13']) {
      expect(
        decideRequestMail({
          dailyCount: 0,
          existing: reserved({ day, attempts: MAIL_MAX_ATTEMPTS_PER_TARGET }),
          now: later,
          day: DAY,
        })
      ).toBe('already-mailed');
    }
  });
});

describe('decideRequestSweep', () => {
  const now = 10_000_000_000;
  const open = { closed: false, closedAt: null, expiresAt: now + 1 };

  it('keeps an expired Request for 7 days after its expiry, so it can still be extended', () => {
    expect(EXPIRED_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(decideRequestSweep({ ...open, expiresAt: now + 1 }, now)).toBe('keep');
    expect(decideRequestSweep({ ...open, expiresAt: now - 1 }, now)).toBe('keep');
    expect(decideRequestSweep({ ...open, expiresAt: now - EXPIRED_RETENTION_MS + 1 }, now)).toBe(
      'keep'
    );
    expect(decideRequestSweep({ ...open, expiresAt: now - EXPIRED_RETENTION_MS }, now)).toBe(
      'delete'
    );
  });

  it('keeps a closed Request for 7 days after closedAt, whatever its expiry', () => {
    const closed = { closed: true, expiresAt: now - EXPIRED_RETENTION_MS - 1 };
    expect(CLOSED_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(decideRequestSweep({ ...closed, closedAt: now - CLOSED_RETENTION_MS + 1 }, now)).toBe(
      'keep'
    );
    expect(decideRequestSweep({ ...closed, closedAt: now - CLOSED_RETENTION_MS }, now)).toBe(
      'delete'
    );
  });

  it('never deletes a malformed Request on a missing expiry alone', () => {
    expect(decideRequestSweep({ ...open, expiresAt: Number.NaN }, now)).toBe('keep');
  });
});

describe('parseRemovePledgeInput', () => {
  it('needs a Community, a Request and a Pledger', () => {
    expect(
      parseRemovePledgeInput({ communityId: 'c1', requestId: 'r1', pledgeUid: 'char:7' })
    ).toEqual({ communityId: 'c1', requestId: 'r1', pledgeUid: 'char:7' });
    expect(() => parseRemovePledgeInput({ communityId: 'c1', requestId: 'r1' })).toThrow();
  });
});

describe('editing a Request', () => {
  it('keeps the stored notify when an edit omits it (an older client), and takes one that is given', () => {
    expect(parseEditRequestInput(post({ requestId: 'r1' })).notify).toBeUndefined();
    expect(
      parseEditRequestInput(post({ requestId: 'r1', notify: { app: false, mail: true } })).notify
    ).toEqual({ app: false, mail: true });
    expect(() =>
      parseEditRequestInput(post({ requestId: 'r1', notify: { app: 1, mail: true } }))
    ).toThrow();
  });

  it('parses a post plus the Request id', () => {
    expect(parseEditRequestInput(post({ requestId: 'r1' })).requestId).toBe('r1');
    expect(() => parseEditRequestInput(post())).toThrow();
  });

  it('keeps line slots when only quantities change', () => {
    const a = { typeId: 1, kind: 'item' };
    const b = { typeId: 2, kind: 'bpc' };
    expect(sameLineSlots([a, b], [a, b])).toBe(true);
    expect(sameLineSlots([a, b], [b, a])).toBe(false);
    expect(sameLineSlots([a, b], [a])).toBe(false);
    expect(sameLineSlots([a, b], [a, { typeId: 2, kind: 'bpo' }])).toBe(false);
  });

  it('lets only the owner edit an unclosed Request, and locks the lines once pledged', () => {
    const base = {
      exists: true,
      ownerUid: 'char:1',
      callerUid: 'char:1',
      closed: false,
      hasPledges: false,
      slotsKept: false,
    };
    expect(decideEdit(base)).toBe('ok');
    expect(decideEdit({ ...base, exists: false })).toBe('not-found');
    expect(decideEdit({ ...base, callerUid: 'char:2' })).toBe('not-owner');
    expect(decideEdit({ ...base, closed: true })).toBe('closed');
    expect(decideEdit({ ...base, hasPledges: true })).toBe('lines-locked');
    expect(decideEdit({ ...base, hasPledges: true, slotsKept: true })).toBe('ok');
  });
});

describe('standing buyback Requests', () => {
  const standing = (over: Record<string, unknown> = {}) => ({
    communityId: 'c1',
    standing: true,
    rate: 90,
    rateBasis: 'buy',
    hubId: 'jita',
    buyLines: [
      { kind: 'group', group: 'ore' },
      { kind: 'type', typeId: 1230, name: 'Veldspar' },
    ],
    ...over,
  });

  it('parses a rate, basis, hub and buy lines, and keeps no item lines', () => {
    expect(parsePostRequestInput(standing())).toEqual({
      communityId: 'c1',
      location: '',
      terms: '',
      lines: [],
      notify: { app: true, mail: false },
      standing: {
        rate: 90,
        rateBasis: 'buy',
        hubId: 'jita',
        buyLines: [
          { kind: 'group', group: 'ore' },
          { kind: 'type', typeId: 1230, name: 'Veldspar' },
        ],
      },
    });
  });

  it('keeps a buyer Character when one is named', () => {
    expect(parsePostRequestInput(standing({ buyerCharacterId: 9001 })).standing).toMatchObject({
      buyerCharacterId: 9001,
    });
  });

  it('takes a rate in tenths from 1 to 200', () => {
    expect(parsePostRequestInput(standing({ rate: 92.5 })).standing?.rate).toBe(92.5);
    for (const rate of [0, 200.1, 90.05, '90', null]) {
      expect(() => parsePostRequestInput(standing({ rate }))).toThrow(/rate/);
    }
  });

  it('refuses an unknown basis, hub or group', () => {
    expect(() => parsePostRequestInput(standing({ rateBasis: 'mid' }))).toThrow(/basis/);
    expect(() => parsePostRequestInput(standing({ hubId: 'hek2' }))).toThrow(/Trade Hub/);
    expect(() =>
      parsePostRequestInput(standing({ buyLines: [{ kind: 'group', group: 'ships' }] }))
    ).toThrow(/group/);
  });

  it('needs at least one buy line, at most the cap, and no repeats', () => {
    expect(() => parsePostRequestInput(standing({ buyLines: [] }))).toThrow(/at least one/);
    const many = Array.from({ length: MAX_BUY_LINES + 1 }, (_, i) => ({
      kind: 'type',
      typeId: i + 1,
      name: `T${i}`,
    }));
    expect(() => parsePostRequestInput(standing({ buyLines: many }))).toThrow(/at most/);
    expect(() =>
      parsePostRequestInput(
        standing({
          buyLines: [
            { kind: 'group', group: 'ore' },
            { kind: 'group', group: 'ore' },
          ],
        })
      )
    ).toThrow(/twice/);
  });

  it('ignores item lines on a standing Request, and buy lines on an ordinary one', () => {
    expect(parsePostRequestInput(standing({ lines: [line] })).lines).toEqual([]);
    expect(
      parsePostRequestInput(post({ buyLines: [{ kind: 'group', group: 'ore' }] }))
    ).not.toHaveProperty('standing');
  });

  it('never expires: open until closed', () => {
    expect(isOpenRequest({ closed: false, expiresAt: 0, standing: true }, 10 ** 15)).toBe(true);
    expect(isOpenRequest({ closed: true, expiresAt: 0, standing: true }, 0)).toBe(false);
  });

  it('is kept by the sweep until closed a week ago', () => {
    const now = 10 ** 13;
    expect(
      decideRequestSweep({ closed: false, closedAt: null, expiresAt: NaN, standing: true }, now)
    ).toBe('keep');
    expect(
      decideRequestSweep(
        { closed: true, closedAt: now - CLOSED_RETENTION_MS, expiresAt: NaN, standing: true },
        now
      )
    ).toBe('delete');
  });
});
