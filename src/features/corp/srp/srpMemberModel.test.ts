import { describe, expect, it } from 'vitest';
import type { HullRule } from '../srpTypes';
import {
  canRefile,
  esiKillmailLink,
  hullIsDoctrineChecked,
  looksLikeKillmailLink,
  lostRowKind,
  GENERIC_ERROR_KEY,
  memberErrorKey,
  memberErrorTarget,
  orderClaims,
  type MemberClaim,
  type LostLoss,
} from './srpMemberModel';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-23T14:00:00Z');

const claim = (over: Partial<MemberClaim> = {}): MemberClaim => ({
  killmailId: 1,
  killmailHash: 'a'.repeat(40),
  hullTypeId: 100,
  classId: 10,
  solarSystemId: 30000142,
  killedAt: NOW - DAY,
  filedAt: NOW - DAY,
  state: 'pending',
  amount: null,
  rejectionReason: null,
  refileCount: 0,
  ...over,
});
const loss = (over: Partial<LostLoss> = {}): LostLoss => ({
  killmailId: 1,
  killmailHash: 'a'.repeat(40),
  hullTypeId: 100,
  classId: 10,
  solarSystemId: 30000142,
  killedAt: NOW - DAY,
  ...over,
});
const ctx = (over: Partial<Parameters<typeof lostRowKind>[1]> = {}) => ({
  claims: [] as MemberClaim[],
  hullRules: [] as HullRule[],
  windowDays: 30,
  now: NOW,
  ...over,
});

describe('lostRowKind', () => {
  it('is open for a recent covered loss with no claim', () => {
    expect(lostRowKind(loss(), ctx())).toBe('open');
  });
  it('is claimed when any claim exists for the killmail, even a rejected one', () => {
    const claims = [claim({ state: 'rejected' })];
    expect(lostRowKind(loss(), ctx({ claims }))).toBe('claimed');
  });
  it('is old past the corp window, and a longer window reopens it', () => {
    const l = loss({ killedAt: NOW - 31 * DAY });
    expect(lostRowKind(l, ctx())).toBe('old');
    expect(lostRowKind(l, ctx({ windowDays: 60 }))).toBe('open');
  });
  it('is notCovered by a hull rule, and the hull rule beats the class rule', () => {
    const classBlock: HullRule = { scope: 'class', id: 10, kind: 'not-covered' };
    const hullPay: HullRule = { scope: 'hull', id: 100, kind: 'pay-percent' };
    expect(lostRowKind(loss(), ctx({ hullRules: [classBlock] }))).toBe('notCovered');
    expect(lostRowKind(loss(), ctx({ hullRules: [classBlock, hullPay] }))).toBe('open');
  });
  it('officer-decides stays open', () => {
    const rule: HullRule = { scope: 'hull', id: 100, kind: 'officer-decides' };
    expect(lostRowKind(loss(), ctx({ hullRules: [rule] }))).toBe('open');
  });
  it('claimed wins over old and notCovered', () => {
    const l = loss({ killedAt: NOW - 90 * DAY });
    const rule: HullRule = { scope: 'hull', id: 100, kind: 'not-covered' };
    expect(lostRowKind(l, ctx({ claims: [claim()], hullRules: [rule] }))).toBe('claimed');
  });
});

describe('canRefile', () => {
  it('allows one re-file of a rejected claim', () => {
    expect(canRefile(claim({ state: 'rejected' }))).toBe(true);
    expect(canRefile(claim({ state: 'rejected', refileCount: 1 }))).toBe(false);
    expect(canRefile(claim({ state: 'pending' }))).toBe(false);
  });
});

describe('orderClaims', () => {
  it('lists open claims first, newest filed first within each group', () => {
    const rows = [
      claim({ killmailId: 1, state: 'paid', filedAt: 5 }),
      claim({ killmailId: 2, state: 'pending', filedAt: 1 }),
      claim({ killmailId: 3, state: 'rejected', filedAt: 9 }),
      claim({ killmailId: 4, state: 'approved', filedAt: 2 }),
    ];
    expect(orderClaims(rows).map((c) => c.killmailId)).toEqual([4, 2, 3, 1]);
  });
  it('does not change its input', () => {
    const rows = [claim({ killmailId: 1, state: 'paid' }), claim({ killmailId: 2 })];
    orderClaims(rows);
    expect(rows[0]!.killmailId).toBe(1);
  });
});

describe('esiKillmailLink', () => {
  it('builds a link the file-claim callable parses', () => {
    expect(esiKillmailLink(5, 'b'.repeat(40))).toBe(
      `https://esi.evetech.net/latest/killmails/5/${'b'.repeat(40)}/`
    );
  });
});

describe('memberErrorKey', () => {
  it('maps every reason the callable sends to its own message', () => {
    for (const reason of [
      'srp-off',
      'not-your-loss',
      'loss-in-other-corp',
      'outside-window',
      'already-claimed',
      'not-covered',
      'fleet-or-fc-required',
      'note-required',
      'hash-unavailable',
      'killmail-not-found',
      'wrong-corp',
      'bad-killmail-link',
    ]) {
      const key = memberErrorKey(Object.assign(new Error('x'), { details: { reason } }));
      expect(key).toMatch(/^srpMember\.errors\./);
      expect(key).not.toBe(GENERIC_ERROR_KEY);
    }
  });
  it('falls back to the generic message for an unknown or missing reason', () => {
    expect(memberErrorKey(new Error('offline'))).toBe(GENERIC_ERROR_KEY);
    expect(memberErrorKey({ details: { reason: 'new-thing' } })).toBe(GENERIC_ERROR_KEY);
  });
});

describe('memberErrorTarget', () => {
  const of = (reason: string) => memberErrorTarget({ details: { reason } });
  it('puts each refusal beside the control that can fix it', () => {
    expect(of('fleet-or-fc-required')).toBe('fleet');
    expect(of('bad-killmail-link')).toBe('link');
    expect(of('not-your-loss')).toBe('link');
    expect(of('outside-window')).toBe('link');
    expect(of('already-claimed')).toBe('link');
    expect(of('not-covered')).toBe('notCovered');
  });
  it('shows what no control can fix, and unknown errors, on the form itself', () => {
    expect(of('srp-off')).toBe('form');
    expect(memberErrorTarget(new Error('offline'))).toBe('form');
  });
});

describe('looksLikeKillmailLink', () => {
  it('accepts a zKillboard or ESI killmail link, not other text', () => {
    expect(looksLikeKillmailLink('https://zkillboard.com/kill/131204551/')).toBe(true);
    expect(looksLikeKillmailLink(esiKillmailLink(5, 'a'.repeat(40)))).toBe(true);
    expect(looksLikeKillmailLink('  zkillboard.com/kill/42  ')).toBe(true);
    expect(looksLikeKillmailLink('https://zkillboard.com/kill/')).toBe(false);
    expect(looksLikeKillmailLink('hello')).toBe(false);
    expect(looksLikeKillmailLink('')).toBe(false);
  });
});

describe('hullIsDoctrineChecked', () => {
  const rules: HullRule[] = [
    { scope: 'hull', id: 100, kind: 'pay-percent', doctrineIds: ['a'] },
    { scope: 'hull', id: 101, kind: 'pay-percent', doctrineIds: [] },
    { scope: 'hull', id: 102, kind: 'pay-percent' },
    { scope: 'class', id: 10, kind: 'pay-percent' },
  ];
  it('is true only for a hull rule that lists a Doctrine Fit', () => {
    expect(hullIsDoctrineChecked(rules, 100)).toBe(true);
    expect(hullIsDoctrineChecked(rules, 101)).toBe(false);
    expect(hullIsDoctrineChecked(rules, 102)).toBe(false);
    expect(hullIsDoctrineChecked(rules, 10)).toBe(false);
  });
});
