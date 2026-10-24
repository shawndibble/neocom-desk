import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import i18n from '@/i18n';
import {
  buildSrpResultMail,
  groupByPilot,
  mailSummary,
  queueSrpResultMails,
  withMailSummary,
  type SrpMailPilot,
} from './srpResultMail';

const send = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/mail', () => ({ sendMail: send }));

const t = i18n.t.bind(i18n);
const pilot = (id: number, name: string): SrpMailPilot => ({
  characterId: id,
  characterName: name,
  claims: [{ killmailId: id * 10, hull: 'Drake', amount: 1_500_000, reason: 'No fleet' }],
});

describe('buildSrpResultMail', () => {
  it('approved: hull, killmail, amount and the separate payment', () => {
    const m = buildSrpResultMail(t, {
      kind: 'approved',
      pilot: 'Varro',
      corpName: 'Acme',
      claims: [{ killmailId: 7, hull: 'Drake', amount: 1_500_000 }],
    });
    expect(m.subject).toBe('SRP approved: Drake');
    expect(m.body).toContain('Hi Varro,');
    expect(m.body).toContain('Drake (killmail 7): 1,500,000 ISK');
    expect(m.body).toContain('paid in game by an officer of Acme');
    expect(m.body).toContain('separate payment');
  });

  it('rejected: hull, reason and the one re-file', () => {
    const m = buildSrpResultMail(t, {
      kind: 'rejected',
      pilot: 'Varro',
      corpName: 'Acme',
      claims: [{ killmailId: 7, hull: 'Drake', reason: 'Solo roam' }],
    });
    expect(m.subject).toBe('SRP rejected: Drake');
    expect(m.body).toContain('Drake (killmail 7). Reason: Solo roam');
    expect(m.body).toContain('re-file it once from the SRP page');
  });

  it('strips tags from free text and lists several claims', () => {
    const m = buildSrpResultMail(t, {
      kind: 'rejected',
      pilot: 'A<b>',
      corpName: 'Acme',
      claims: [
        { killmailId: 1, hull: 'Drake', reason: '<font>no' },
        { killmailId: 2, hull: 'Ferox', reason: 'dupe' },
      ],
    });
    expect(m.subject).toBe('SRP rejected: 2 claims');
    expect(m.body).not.toMatch(/[<>]/);
    expect(m.body).toContain('Ferox (killmail 2). Reason: dupe');
  });
});

describe('groupByPilot', () => {
  it('one entry per pilot, skipping a claim with no pilot', () => {
    const claim = { killmailId: 1, hull: 'Drake' };
    const out = groupByPilot([
      { characterId: 5, characterName: 'A', claim },
      { characterId: 5, characterName: 'A', claim: { ...claim, killmailId: 2 } },
      { characterId: null, characterName: null, claim },
      { characterId: 6, characterName: null, claim },
    ]);
    expect(out.map((p) => [p.characterName, p.claims.length])).toEqual([
      ['A', 2],
      ['#6', 1],
    ]);
  });
});

describe('queueSrpResultMails', () => {
  const MAIL = 'esi-mail.send_mail.v1';
  const input = (pilots: SrpMailPilot[], over = {}) => ({
    kind: 'approved' as const,
    corpName: 'Acme',
    pilots,
    senderCharacterId: 9,
    corporationId: 3,
    ...over,
  });
  const grant = (scopes: string[]) =>
    db.tokens.put({
      characterId: 9,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 1,
      scopes,
    });
  beforeEach(async () => {
    send.mockClear();
    await db.corpMailQueue.clear();
    await db.tokens.clear();
  });

  it('queues one paced mail per pilot, and sends none directly', async () => {
    await grant([MAIL]);
    const pilots = Array.from({ length: 8 }, (_, i) => pilot(i + 1, `P${i + 1}`));
    const run = await queueSrpResultMails(t, input(pilots));
    expect(run).toEqual({
      queued: pilots.map((p) => p.characterName),
      failed: [],
      missingScope: false,
    });
    const rows = await db.corpMailQueue.toArray();
    expect(rows).toHaveLength(8);
    expect(send).not.toHaveBeenCalled();
    for (const r of rows) {
      expect(r).toMatchObject({
        kind: 'srp-result',
        senderCharacterId: 9,
        corporationId: 3,
        status: 'waiting',
      });
      expect(r.body).toContain(`Hi ${r.recipientName},`);
      expect(r.subject).toBe('SRP approved: Drake');
    }
    expect(new Set(rows.map((r) => r.order)).size).toBe(8);
  });

  it('without the mail scope queues nothing and says so', async () => {
    await grant(['esi-skills.read_skills.v1']);
    const run = await queueSrpResultMails(t, input([pilot(1, 'A')]));
    expect(run.missingScope).toBe(true);
    expect(await db.corpMailQueue.count()).toBe(0);
  });

  it('nothing to mail is not a missing scope', async () => {
    const run = await queueSrpResultMails(t, input([]));
    expect(run).toEqual({ queued: [], failed: [], missingScope: false });
  });

  it('an unknown corporation fails the mail without throwing', async () => {
    await grant([MAIL]);
    const run = await queueSrpResultMails(t, input([pilot(1, 'A')], { corporationId: null }));
    expect(run.failed).toEqual(['A']);
  });
});

describe('summary', () => {
  it('reads like the batch toast', () => {
    const run = { queued: ['A', 'B'], failed: ['Tamsin Vell'], missingScope: false };
    expect(withMailSummary(t, 'Approved 3 of 3', run)).toBe(
      'Approved 3 of 3. Mail queued for 2 pilots, sent about 5 a minute. Mail failed for Tamsin Vell, status still saved.'
    );
  });
  it('single pilot, and permission missing', () => {
    expect(mailSummary(t, { queued: ['A'], failed: [], missingScope: false })).toBe(
      'Mail queued for 1 pilot.'
    );
    expect(mailSummary(t, { queued: [], failed: [], missingScope: true })).toBe(
      'No mail sent: mail permission missing.'
    );
  });
  it('adds nothing when nothing was mailed', () => {
    expect(withMailSummary(t, 'Approved', { queued: [], failed: [], missingScope: false })).toBe(
      'Approved'
    );
  });
});
