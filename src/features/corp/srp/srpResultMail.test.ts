import { describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import {
  buildSrpResultMail,
  groupByPilot,
  mailSummary,
  sendSrpResultMails,
  withMailSummary,
  type SrpMailPilot,
} from './srpResultMail';

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

describe('sendSrpResultMails', () => {
  const input = (pilots: SrpMailPilot[]) => ({
    kind: 'approved' as const,
    corpName: 'Acme',
    pilots,
  });

  it('sends one mail per pilot, in order', async () => {
    const send = vi.fn().mockResolvedValue(1);
    const run = await sendSrpResultMails(t, input([pilot(1, 'A'), pilot(2, 'B')]), {
      hasScope: true,
      send,
    });
    expect(run).toEqual({ sent: ['A', 'B'], failed: [], missingScope: false });
    expect(send.mock.calls.map((c) => c[0])).toEqual([1, 2]);
  });

  it('a failure is recorded and the rest still go', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(1);
    const run = await sendSrpResultMails(t, input([pilot(1, 'A'), pilot(2, 'B')]), {
      hasScope: true,
      send,
    });
    expect(run).toEqual({ sent: ['B'], failed: ['A'], missingScope: false });
  });

  it('stops trying after ESI throttles', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('slow'), { status: 420 }));
    const run = await sendSrpResultMails(t, input([pilot(1, 'A'), pilot(2, 'B')]), {
      hasScope: true,
      send,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(run.failed).toEqual(['A', 'B']);
  });

  it('without the mail scope sends nothing', async () => {
    const send = vi.fn();
    const run = await sendSrpResultMails(t, input([pilot(1, 'A')]), { hasScope: false, send });
    expect(send).not.toHaveBeenCalled();
    expect(run.missingScope).toBe(true);
  });

  it('nothing to mail is not a missing scope', async () => {
    const run = await sendSrpResultMails(t, input([]), { hasScope: false, send: vi.fn() });
    expect(run.missingScope).toBe(false);
  });
});

describe('summary', () => {
  it('reads like the batch toast', () => {
    const run = { sent: ['A', 'B'], failed: ['Tamsin Vell'], missingScope: false };
    expect(withMailSummary(t, 'Approved 3 of 3', run)).toBe(
      'Approved 3 of 3. Mail sent to 2 pilots. Mail failed for Tamsin Vell, status still saved.'
    );
  });
  it('single pilot, and permission missing', () => {
    expect(mailSummary(t, { sent: ['A'], failed: [], missingScope: false })).toBe(
      'Mail sent to 1 pilot.'
    );
    expect(mailSummary(t, { sent: [], failed: [], missingScope: true })).toBe(
      'No mail sent: mail permission missing.'
    );
  });
  it('adds nothing when nothing was mailed', () => {
    expect(withMailSummary(t, 'Approved', { sent: [], failed: [], missingScope: false })).toBe(
      'Approved'
    );
  });
});
