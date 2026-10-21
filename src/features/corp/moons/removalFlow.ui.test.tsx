import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  start: vi.fn(),
  sent: vi.fn(),
  cancel: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock('../taxBook/feederClient', () => ({
  startFeederRemoval: api.start,
  recordFeederRemovalSent: api.sent,
  cancelFeederRemoval: api.cancel,
}));
vi.mock('@/features/corpTaxBook/mailQueue', () => ({ enqueueRemovalMails: api.enqueue }));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn().mockResolvedValue(new Map([[11, 'Ceo Pilot']])),
}));

import { cancelRemovalAndMail, removeNowUrl, startRemovalAndMail } from './removalFlow';

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
    api.start.mockResolvedValue({ startedAt: 5, code: 'CODE', recipients: [11, 12] });
    await startRemovalAndMail(ctx);
    const queued = api.enqueue.mock.calls[0]![0];
    expect(queued).toMatchObject({ kind: 'removal', corporationId: 1, feederCorporationId: 2 });
    expect(queued.recipients).toEqual([
      { id: 11, name: 'Ceo Pilot' },
      { id: 12, name: '#12' },
    ]);
    expect(queued.mail.body).toContain(removeNowUrl(window.location.origin, 'CODE'));
    expect(api.sent).not.toHaveBeenCalled();
  });

  it('starts the clock at once when nobody is left to mail', async () => {
    api.start.mockResolvedValue({ startedAt: 5, code: 'CODE', recipients: [] });
    await startRemovalAndMail(ctx);
    expect(api.enqueue).not.toHaveBeenCalled();
    expect(api.sent).toHaveBeenCalledWith(7, 1, 2);
  });

  it('queues nothing when the server refuses the start', async () => {
    api.start.mockRejectedValue(new Error('refused'));
    await expect(startRemovalAndMail(ctx)).rejects.toThrow('refused');
    expect(api.enqueue).not.toHaveBeenCalled();
  });
});

describe('cancelRemovalAndMail', () => {
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
