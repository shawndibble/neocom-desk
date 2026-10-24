import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { canSendMail, queueOfficerMail, resolveRecipients } from './officerMail';

const MAIL = 'esi-mail.send_mail.v1';
vi.mock('@/features/character/names', () => ({
  resolveNames: async (ids: number[]) =>
    new Map(ids.filter((id) => id !== 404).map((id) => [id, `Pilot ${id}`])),
}));

describe('canSendMail', () => {
  it('is true only with the send-mail scope', () => {
    expect(canSendMail([MAIL, 'esi-skills.read_skills.v1'])).toBe(true);
    expect(canSendMail(['esi-skills.read_skills.v1'])).toBe(false);
    expect(canSendMail(undefined)).toBe(false);
  });
});

describe('resolveRecipients', () => {
  it('names each id, falling back to #id, and prefers a known name', async () => {
    const out = await resolveRecipients([1, 404, 3], new Map([[3, 'Known']]));
    expect(out).toEqual([
      { id: 1, name: 'Pilot 1' },
      { id: 404, name: '#404' },
      { id: 3, name: 'Known' },
    ]);
  });
});

describe('queueOfficerMail', () => {
  beforeEach(async () => {
    await db.tokens.clear();
  });
  const base = { senderCharacterId: 7, grantedScopes: [MAIL] };

  it('hands the resolved recipients to enqueue and reports the count', async () => {
    const enqueue = vi.fn().mockResolvedValue({ queued: 2 });
    const out = await queueOfficerMail({ ...base, recipients: [1, 2], enqueue });
    expect(enqueue).toHaveBeenCalledWith([
      { id: 1, name: 'Pilot 1' },
      { id: 2, name: 'Pilot 2' },
    ]);
    expect(out).toEqual({ status: 'queued', queued: 2 });
  });

  it('without the scope queues nothing', async () => {
    const enqueue = vi.fn();
    const out = await queueOfficerMail({ ...base, grantedScopes: [], recipients: [1], enqueue });
    expect(out).toEqual({ status: 'no-scope' });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('reads the sender token when no scopes are given, so a fresh grant counts', async () => {
    const enqueue = vi.fn().mockResolvedValue({ queued: 1 });
    const noScopes = { senderCharacterId: base.senderCharacterId };
    expect((await queueOfficerMail({ ...noScopes, recipients: [1], enqueue })).status).toBe(
      'no-scope'
    );
    await db.tokens.put({
      characterId: 7,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 1,
      scopes: [MAIL],
    });
    expect((await queueOfficerMail({ ...noScopes, recipients: [1], enqueue })).status).toBe(
      'queued'
    );
  });

  it('nobody to tell is not a missing scope', async () => {
    const enqueue = vi.fn();
    expect(await queueOfficerMail({ ...base, recipients: [], enqueue })).toEqual({
      status: 'none',
    });
    expect(await queueOfficerMail({ ...base, grantedScopes: [], recipients: [], enqueue })).toEqual(
      { status: 'none' }
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('accepts a lazy recipient list', async () => {
    const enqueue = vi.fn().mockResolvedValue({ queued: 1 });
    await queueOfficerMail({ ...base, recipients: async () => [5], enqueue });
    expect(enqueue).toHaveBeenCalledWith([{ id: 5, name: 'Pilot 5' }]);
  });

  it('never throws: a failing enqueue or recipient lookup comes back as failed', async () => {
    const boom = vi.fn().mockRejectedValue(new Error('db'));
    expect((await queueOfficerMail({ ...base, recipients: [1], enqueue: boom })).status).toBe(
      'failed'
    );
    const out = await queueOfficerMail({
      ...base,
      recipients: async () => {
        throw new Error('esi');
      },
      enqueue: vi.fn(),
    });
    expect(out.status).toBe('failed');
  });
});
