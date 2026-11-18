import { HOUR_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { MAX_MAIL_SUBJECT } from '@/engine/communities/requestMail';
import {
  buildVettingRequestMail,
  mailGate,
  requestMailCooldown,
  requestMailInput,
  type VettingRequestMailInput,
} from './vettingRequestMail';

const t = i18n.t.bind(i18n);

const input = (over: Partial<VettingRequestMailInput> = {}): VettingRequestMailInput => ({
  pilot: 'Ren Halvard',
  role: 'Accountant',
  corpName: 'Brass Meridian Logistics',
  officer: 'Bram Kessel',
  link: 'https://neocomdesk.com/vetting',
  ...over,
});

describe('buildVettingRequestMail', () => {
  it('says who asked, for what, what is read, that they may decline, and the link', () => {
    const mail = buildVettingRequestMail(t, input());
    expect(mail.subject).toBe('Review requested before Accountant');
    expect(mail.body).toBe(
      [
        'Hi Ren Halvard,',
        'I asked for a review before you are made Accountant in Brass Meridian Logistics. Other officers decide it. I cannot sign it off.',
        'What happens: you log in with your characters and choose which to share. Neocom Desk reads them once: corporation history, wallet, contracts, contacts, skills, and who you exchanged mail with (never the subject or the text). Every row read is kept with the report, for officers only, until it is deleted: 30 days after a decision, 90 days after you share if nobody decides, or when you delete it. No login is kept.',
        'You can see who opens the report, delete it at any time, or decline. If you decline, the reviewers are told and nothing is read.',
        'Open it: https://neocomdesk.com/vetting\nLog in as Ren Halvard.',
        'Bram Kessel',
      ].join('\n\n')
    );
  });

  it('strips markup from names and the role, and clips the subject', () => {
    const mail = buildVettingRequestMail(
      t,
      input({ role: '<b>Big</b> ' + 'x'.repeat(200), pilot: 'A<br>B' })
    );
    expect(mail.body).not.toContain('<');
    expect(mail.subject.length).toBeLessThanOrEqual(MAX_MAIL_SUBJECT);
  });
});

describe('requestMailInput', () => {
  const review = {
    state: 'requested' as const,
    kind: 'promotion' as const,
    role: 'Accountant',
    pilot: { characterId: 1, name: 'Ren Halvard', corporationName: 'Brass' },
  };
  it('needs a request still waiting on the member', () => {
    expect(requestMailInput(review, 'Corp', 'Bram', 'link')).toMatchObject({
      pilot: 'Ren Halvard',
      role: 'Accountant',
      officer: 'Bram',
    });
    expect(requestMailInput({ ...review, state: 'open' }, 'Corp', 'Bram', 'link')).toBeNull();
  });
});

describe('requestMailCooldown', () => {
  const now = 100 * HOUR_MS;
  it('is free before any mail, and after a day', () => {
    expect(requestMailCooldown(undefined, now)).toBeNull();
    expect(requestMailCooldown({ sentAt: now - 24 * HOUR_MS }, now)).toBeNull();
  });
  it('says how long is left within a day', () => {
    expect(requestMailCooldown({ sentAt: now - 6 * HOUR_MS }, now)).toEqual({
      remainingMs: 18 * HOUR_MS,
    });
  });
});

describe('mailGate', () => {
  const now = 100 * HOUR_MS;
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    state: 'requested',
    requestedBy: { characterId: 7, name: 'Bram' },
    ...over,
  });
  const gate = (reviews: unknown[], officer = 7) =>
    mailGate({ reviews } as never, 'r1', officer, now);

  it('passes with slot 0 when never mailed', () => {
    expect(gate([row()])).toMatchObject({ ok: true, previousSentAt: 0 });
  });
  it('uses the server sentAt as the slot once a day has passed', () => {
    const sentAt = now - 25 * HOUR_MS;
    expect(gate([row({ requestMail: { sentAt } })])).toMatchObject({
      ok: true,
      previousSentAt: sentAt,
    });
  });
  it('refuses within a day (another tab mailed it)', () => {
    expect(gate([row({ requestMail: { sentAt: now - HOUR_MS } })])).toEqual({
      ok: false,
      reason: 'cooldown',
    });
  });
  it('refuses a non-asker, a shared review and a missing one', () => {
    expect(gate([row()], 8)).toEqual({ ok: false, reason: 'not-asker' });
    expect(gate([row({ state: 'open' })])).toEqual({ ok: false, reason: 'gone' });
    expect(gate([])).toEqual({ ok: false, reason: 'gone' });
  });
});
