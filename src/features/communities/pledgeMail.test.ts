import { describe, expect, it, vi } from 'vitest';
import { EsiError } from '@/esi/errors';
import { buildPledgeMail, sendPledgeMail, type PledgeMailDeps } from './pledgeMail';

const reservation = {
  communityName: 'Pals',
  pledgerName: 'Bo Tanner',
  requesterName: 'Kestrel Vane',
  requesterCharacterId: 91,
  remaining: 90,
};

function deps(over: Partial<PledgeMailDeps> = {}): PledgeMailDeps {
  return {
    reserve: vi.fn().mockResolvedValue(reservation),
    confirm: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(1),
    ...over,
  };
}
const run = (d: PledgeMailDeps) =>
  sendPledgeMail({ compose: () => ({ subject: 's', body: 'b' }) }, d);

const callableError = (reason: string) => Object.assign(new Error(reason), { details: { reason } });

describe('sendPledgeMail', () => {
  it('reserves, sends to the requester the server named, and confirms', async () => {
    const d = deps();
    expect(await run(d)).toBe('sent');
    expect(d.send).toHaveBeenCalledWith(91, 's', 'b');
    expect(d.confirm).toHaveBeenCalledTimes(1);
    expect(d.release).not.toHaveBeenCalled();
  });

  it('composes from what the server reserved', async () => {
    const compose = vi.fn().mockReturnValue({ subject: 's', body: 'b' });
    await sendPledgeMail({ compose }, deps());
    expect(compose).toHaveBeenCalledWith(reservation);
  });

  it('gives the slot back when ESI refuses the mail', async () => {
    const d = deps({ send: vi.fn().mockRejectedValue(new EsiError(403, 'no')) });
    expect(await run(d)).toBe('refused');
    expect(d.release).toHaveBeenCalledTimes(1);
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it('keeps the slot spent when ESI gave no answer, since the mail may have gone out', async () => {
    const d = deps({ send: vi.fn().mockRejectedValue(new EsiError(0, 'timeout')) });
    expect(await run(d)).toBe('unsure');
    expect(d.release).not.toHaveBeenCalled();
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it('sends nothing at the daily cap', async () => {
    const d = deps({ reserve: vi.fn().mockRejectedValue(callableError('daily-cap')) });
    expect(await run(d)).toBe('dailyCap');
    expect(d.send).not.toHaveBeenCalled();
  });

  it('reports a Request already mailed about, and one the server would not reserve', async () => {
    expect(
      await run(deps({ reserve: vi.fn().mockRejectedValue(callableError('already-mailed')) }))
    ).toBe('alreadyMailed');
    const d = deps({ reserve: vi.fn().mockRejectedValue(new Error('boom')) });
    expect(await run(d)).toBe('failed');
    expect(d.send).not.toHaveBeenCalled();
  });

  it('retries the confirm, and still reports the mail as sent if it never lands', async () => {
    const d = deps({ confirm: vi.fn().mockRejectedValue(new Error('offline')) });
    expect(await run(d)).toBe('sent');
    expect(d.confirm).toHaveBeenCalledTimes(3);
  });
});

describe('buildPledgeMail', () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    `${key}${opts ? JSON.stringify(opts) : ''}`;
  const base = {
    communityName: 'Pals <b>',
    pledgerName: 'Bo Tanner',
    requesterName: 'Kestrel Vane',
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
    ],
  };

  it('names the Pledger and Community, lists each Pledged line and links the board', () => {
    const { subject, body } = buildPledgeMail(t, base);
    expect(subject).toContain('Bo Tanner');
    expect(subject).toContain('Pals b');
    for (const needle of ['Reactive Metals', 'Ishtar Blueprint', base.link, 'Kestrel Vane']) {
      expect(body).toContain(needle);
    }
    expect(body).toContain('board.spec.runs');
    expect(body).not.toContain('<b>');
  });

  it('clips the subject to the game’s field', () => {
    const { subject } = buildPledgeMail(
      (key) => (key.endsWith('subject') ? 'x'.repeat(300) : key),
      base
    );
    expect(Array.from(subject).length).toBeLessThanOrEqual(100);
  });
});
