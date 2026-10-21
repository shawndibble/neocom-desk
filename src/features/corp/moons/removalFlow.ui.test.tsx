import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  start: vi.fn(),
  sent: vi.fn(),
  cancel: vi.fn(),
  enqueue: vi.fn(),
  drop: vi.fn(),
  stamp: vi.fn(),
}));
vi.mock('../taxBook/feederClient', () => ({
  startFeederRemoval: api.start,
  recordFeederRemovalSent: api.sent,
  cancelFeederRemoval: api.cancel,
}));
vi.mock('@/features/corpTaxBook/mailQueue', () => ({
  enqueueRemovalMails: api.enqueue,
  dropRemovalMails: api.drop,
  stampRemovalMails: api.stamp,
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn().mockResolvedValue(new Map([[11, 'Ceo Pilot']])),
}));

import {
  cancelRemovalAndMail,
  recordRemovalNoticeSent,
  removeNowUrl,
  startRemovalAndMail,
} from './removalFlow';

const ctx = {
  characterId: 7,
  corporationId: 1,
  feederCorporationId: 2,
  accountingName: 'Brass Meridian Logistics',
  ownerName: 'Ostrava Salvage',
  officerName: 'Kestrel Vane',
};

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.enqueue.mockResolvedValue(2);
});

describe('startRemovalAndMail', () => {
  it('queues the notice for each recipient with the payee link, never starting the clock itself', async () => {
    api.start.mockResolvedValue({
      startedAt: 5,
      code: 'CODE',
      recipients: [11, 12],
      ownerRecipients: [11],
    });
    await startRemovalAndMail(ctx);
    const queued = api.enqueue.mock.calls[0]![0];
    expect(queued).toMatchObject({
      kind: 'removal',
      corporationId: 1,
      feederCorporationId: 2,
      removalStartedAt: 5,
    });
    expect(queued.recipients).toEqual([
      { id: 11, name: 'Ceo Pilot', startsClock: true },
      { id: 12, name: '#12', startsClock: false },
    ]);
    expect(queued.mail.body).toContain(removeNowUrl(window.location.origin, 'CODE'));
    expect(api.sent).not.toHaveBeenCalled();
  });

  it("mails the moon owner side first, so the clock starts on the owner's copy (#4617)", async () => {
    api.start.mockResolvedValue({
      startedAt: 5,
      code: 'CODE',
      recipients: [12, 11],
      ownerRecipients: [11],
    });
    await startRemovalAndMail(ctx);
    expect(api.enqueue.mock.calls[0]![0].recipients.map((r: { id: number }) => r.id)).toEqual([
      11, 12,
    ]);
  });

  it('a server without the split treats every copy as starting the clock', async () => {
    api.start.mockResolvedValue({ startedAt: 5, code: 'CODE', recipients: [11, 12] });
    await startRemovalAndMail(ctx);
    const queued = api.enqueue.mock.calls[0]![0];
    expect(queued.recipients.every((r: { startsClock: boolean }) => r.startsClock)).toBe(true);
  });

  it('never starts the clock when no moon owner side copy can go out (#4617)', async () => {
    api.start.mockResolvedValue({
      startedAt: 5,
      code: 'CODE',
      recipients: [12],
      ownerRecipients: [],
    });
    await startRemovalAndMail(ctx);
    expect(api.sent).not.toHaveBeenCalled();
    expect(api.enqueue.mock.calls[0]![0].recipients).toEqual([
      { id: 12, name: '#12', startsClock: false },
    ]);
  });

  it('with nobody to mail at all, waits on "I sent the notice" (#4617)', async () => {
    api.start.mockResolvedValue({
      startedAt: 5,
      code: 'CODE',
      recipients: [],
      ownerRecipients: [],
    });
    await startRemovalAndMail(ctx);
    expect(api.enqueue).not.toHaveBeenCalled();
    expect(api.sent).not.toHaveBeenCalled();
  });

  it('queues nothing when the server refuses the start', async () => {
    api.start.mockRejectedValue(new Error('refused'));
    await expect(startRemovalAndMail(ctx)).rejects.toThrow('refused');
    expect(api.enqueue).not.toHaveBeenCalled();
  });
});

describe('cancelRemovalAndMail', () => {
  it('drops the notices still waiting to go out (#4617)', async () => {
    api.cancel.mockResolvedValue({ recipients: [11] });
    await cancelRemovalAndMail(ctx);
    expect(api.drop).toHaveBeenCalledWith(1, 2);
  });

  it('keeps the queued notices when the cancel fails', async () => {
    api.cancel.mockRejectedValue(new Error('refused'));
    await expect(cancelRemovalAndMail(ctx)).rejects.toThrow('refused');
    expect(api.drop).not.toHaveBeenCalled();
  });

  it('queues the short second mail to the people the server names', async () => {
    api.cancel.mockResolvedValue({ recipients: [11] });
    await cancelRemovalAndMail(ctx);
    expect(api.enqueue.mock.calls[0]![0]).toMatchObject({
      kind: 'removalCancelled',
      recipients: [{ id: 11, name: 'Ceo Pilot' }],
    });
    expect(api.enqueue.mock.calls[0]![0].mail.body).not.toMatch(/rate|margin/i);
  });

  it('sends nothing when there is nobody to tell', async () => {
    api.cancel.mockResolvedValue({ recipients: [] });
    await cancelRemovalAndMail(ctx);
    expect(api.enqueue).not.toHaveBeenCalled();
  });
});

describe('recordRemovalNoticeSent (#4617)', () => {
  it('stamps the recorded time on the copies still to send', async () => {
    api.sent.mockResolvedValue({ effectiveAt: 99 });
    await recordRemovalNoticeSent(7, 1, 2, 50);
    expect(api.sent).toHaveBeenCalledWith(7, 1, 2, 50);
    expect(api.stamp).toHaveBeenCalledWith(1, 2, 99);
  });
  it('stamps nothing when no clock is running', async () => {
    api.sent.mockResolvedValue({ effectiveAt: null });
    await recordRemovalNoticeSent(7, 1, 2);
    expect(api.stamp).not.toHaveBeenCalled();
  });
});
