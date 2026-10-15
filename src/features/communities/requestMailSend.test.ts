import { describe, expect, it, vi } from 'vitest';
import { EsiError } from '@/esi/errors';
import {
  buildRequestMail,
  sendRequestMails,
  type RequestMailDeps,
  type RequestMailRecipient,
} from './requestMailSend';
import { callableErrorReason } from './callableError';

const recipients: RequestMailRecipient[] = [
  { uid: 'char:2', characterId: 2, name: 'Bo Tanner' },
  { uid: 'char:3', characterId: 3, name: 'Cael Ito' },
  { uid: 'char:4', characterId: 4, name: 'Dana Reyes' },
];
const reservation = { communityName: 'Pals', requesterName: 'Kestrel Vane', remaining: 90 };

function deps(over: Partial<RequestMailDeps> = {}): RequestMailDeps {
  return {
    reserve: vi.fn().mockResolvedValue(reservation),
    confirm: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(1),
    ...over,
  };
}
const run = (d: RequestMailDeps, list = recipients) =>
  sendRequestMails(
    {
      communityId: 'c1',
      requestId: 'r1',
      recipients: list,
      compose: () => ({ subject: 's', body: 'b' }),
    },
    d
  );

const callableError = (reason: string) => Object.assign(new Error(reason), { details: { reason } });

describe('sendRequestMails', () => {
  it('reserves, sends and confirms one mail per recipient, in order', async () => {
    const d = deps();
    const results = await run(d);
    expect(results.map((r) => r.outcome)).toEqual(['sent', 'sent', 'sent']);
    expect(d.reserve).toHaveBeenCalledTimes(3);
    expect(d.send).toHaveBeenCalledTimes(3);
    expect(d.confirm).toHaveBeenCalledTimes(3);
    expect(d.release).not.toHaveBeenCalled();
    expect(d.send).toHaveBeenNthCalledWith(2, 3, 's', 'b');
  });

  it('sends nothing for nobody', async () => {
    const d = deps();
    expect(await run(d, [])).toEqual([]);
    expect(d.reserve).not.toHaveBeenCalled();
  });

  it('gives the slot back when ESI refuses the mail, and carries on', async () => {
    const d = deps({
      send: vi.fn().mockRejectedValueOnce(new EsiError(403, 'no')).mockResolvedValue(1),
    });
    const results = await run(d);
    expect(results.map((r) => r.outcome)).toEqual(['refused', 'sent', 'sent']);
    expect(d.release).toHaveBeenCalledTimes(1);
  });

  it('keeps the slot spent when ESI gave no answer, since the mail may have gone out', async () => {
    const d = deps({ send: vi.fn().mockRejectedValue(new EsiError(0, 'timeout')) });
    const results = await run(d, recipients.slice(0, 1));
    expect(results[0].outcome).toBe('unsure');
    expect(d.release).not.toHaveBeenCalled();
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it('stops at the daily cap and marks everyone after it unsent without asking again', async () => {
    const d = deps({
      reserve: vi
        .fn()
        .mockResolvedValueOnce(reservation)
        .mockRejectedValueOnce(callableError('daily-cap')),
    });
    const results = await run(d);
    expect(results.map((r) => r.outcome)).toEqual(['sent', 'dailyCap', 'dailyCap']);
    expect(d.reserve).toHaveBeenCalledTimes(2);
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it('reports a recipient already mailed about this Request, or one the server would not reserve', async () => {
    const d = deps({
      reserve: vi
        .fn()
        .mockRejectedValueOnce(callableError('already-mailed'))
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(reservation),
    });
    const results = await run(d);
    expect(results.map((r) => r.outcome)).toEqual(['alreadyMailed', 'failed', 'sent']);
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it('retries the confirm, and still reports the mail as sent if it never lands', async () => {
    const d = deps({ confirm: vi.fn().mockRejectedValue(new Error('offline')) });
    const results = await run(d, recipients.slice(0, 1));
    expect(results[0].outcome).toBe('sent');
    expect(d.confirm).toHaveBeenCalledTimes(3);
  });

  it('reports each result as it lands', async () => {
    const seen: string[] = [];
    await sendRequestMails(
      {
        communityId: 'c1',
        requestId: 'r1',
        recipients,
        compose: () => ({ subject: '', body: '' }),
        onResult: (r) => seen.push(r.uid),
      },
      deps()
    );
    expect(seen).toEqual(['char:2', 'char:3', 'char:4']);
  });

  it('reads a callable reason the way the dialog does', () => {
    expect(callableErrorReason(callableError('daily-cap'))).toBe('daily-cap');
  });
});

describe('buildRequestMail', () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    `${key}${opts ? JSON.stringify(opts) : ''}`;
  const base = {
    communityName: 'Pals <b>',
    requesterName: 'Kestrel Vane',
    location: 'Badivefi',
    terms: '90% JBV',
    link: 'https://x.test/communities?community=c1&tab=requests',
    lines: [
      { typeId: 1, name: 'Reactive Metals', quantity: 350000, kind: 'item' as const },
      {
        typeId: 2,
        name: 'Ishtar Blueprint',
        quantity: 3,
        kind: 'bpc' as const,
        runs: 10,
        me: 10,
        te: 20,
      },
      { typeId: 3, name: 'Rifter Blueprint', quantity: 1, kind: 'bpo' as const },
    ],
  };

  it('lists every line, the location, the terms and the board link', () => {
    const { subject, body } = buildRequestMail(t, base);
    expect(subject).toContain('Kestrel Vane');
    expect(body).toContain('Pals b');
    for (const needle of [
      'Reactive Metals',
      'Ishtar Blueprint',
      'Rifter Blueprint',
      'Badivefi',
      '90% JBV',
      base.link,
      'Kestrel Vane',
    ]) {
      expect(body).toContain(needle);
    }
    expect(body).toContain('board.spec.runs');
    expect(body).not.toContain('<b>');
  });

  it('leaves out an empty location and terms', () => {
    const { body } = buildRequestMail(t, { ...base, location: '', terms: '' });
    expect(body).not.toContain('communities.board.requestMail.location');
    expect(body).not.toContain('communities.board.requestMail.terms');
  });
});
