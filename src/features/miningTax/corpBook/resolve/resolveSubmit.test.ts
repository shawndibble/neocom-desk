import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookRowView } from '@/engine/corpTaxBook/personal';

const store = vi.hoisted(() => ({
  disputeCorpTaxBookConflict: vi.fn(async () => ({ disputeId: 'd' })),
  declareCorpTaxBookPayment: vi.fn(),
}));
const mailer = vi.hoisted(() => ({
  sendTaxQuestionMail: vi.fn(async () => ({ status: 'sent', to: [9], fellBackToCeo: false })),
}));
vi.mock('../corpBookStore', () => store);
vi.mock('../sendTaxQuestionMail', () => mailer);

import { sendProof, tellNotOwed, tellNotPaying } from './resolveSubmit';

const ctx = {
  characterId: 7,
  memberName: 'Kestrel Vane',
  corporationId: 1,
  corpName: 'Bureau',
  contact: undefined,
};
const row = (over: Partial<BookRowView> = {}) =>
  ({
    state: 'billed',
    date: '2026-11-06',
    recordKey: '7:1000:2026-11-06',
    oreLines: [{ typeId: 45490, quantity: 100 }],
    billed: 1_840_320,
    ...over,
  }) as BookRowView;

describe('resolve submits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells the corporation a member is not paying, with the whole day and their reason', async () => {
    await tellNotPaying(ctx, row(), 'Untaxed op');
    expect(store.disputeCorpTaxBookConflict).toHaveBeenCalledWith(7, {
      corporationId: 1,
      date: '2026-11-06',
      kind: 'notPaying',
      reason: 'Untaxed op',
      lines: [{ recordKey: '7:1000:2026-11-06', typeId: 45490, quantity: 100 }],
    });
    expect(mailer.sendTaxQuestionMail).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ kind: 'notPaying' }) })
    );
  });

  it('disputes a rate at the rate the member recorded', async () => {
    await tellNotOwed(
      ctx,
      row({ dispute: { rate: true, quantity: false, personalPct: 10, bookPct: 12 } as never }),
      'We agreed 10%'
    );
    expect(store.disputeCorpTaxBookConflict).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ kind: 'rate', claimedPct: 10, reason: 'We agreed 10%' })
    );
  });

  it('disputes only the ore the book recorded beyond the member’s own record', async () => {
    await tellNotOwed(
      ctx,
      row({
        oreLines: [{ typeId: 45490, quantity: 120 }],
        personalOreLines: [{ typeId: 45490, quantity: 100 }],
        dispute: { quantity: true, rate: false } as never,
      }),
      'I mined 100'
    );
    expect(store.disputeCorpTaxBookConflict).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        kind: 'quantity',
        lines: [{ recordKey: '7:1000:2026-11-06', typeId: 45490, quantity: 20 }],
      })
    );
  });

  // The old fallback sent the whole day as a quantity dispute: a bill the member never questioned.
  it('never falls back to a whole-day quantity dispute when nothing differs', async () => {
    await expect(
      tellNotOwed(
        ctx,
        row({
          personalOreLines: [{ typeId: 45490, quantity: 100 }],
          dispute: { quantity: true, rate: false } as never,
        }),
        'No'
      )
    ).rejects.toThrow();
    await expect(tellNotOwed(ctx, row(), 'No')).rejects.toThrow();
    expect(store.disputeCorpTaxBookConflict).not.toHaveBeenCalled();
    expect(mailer.sendTaxQuestionMail).not.toHaveBeenCalled();
  });

  // Every transfer found in the wallet: credited at once, so there is no one to mail.
  it('sends no mail when the book credits the proof itself', async () => {
    store.declareCorpTaxBookPayment.mockResolvedValueOnce({
      declarationId: 'x',
      checks: [{ result: 'found' }],
      confirmed: true,
    });
    const out = await sendProof(
      ctx,
      's1',
      [{ amount: 25, at: '2026-11-02T18:41:00Z', journalRef: 1, recipient: 'corporation' }],
      '',
      '2026-10-29'
    );
    expect(out).toEqual({ checks: [{ result: 'found' }], confirmed: true });
    expect(mailer.sendTaxQuestionMail).not.toHaveBeenCalled();
  });

  it('mails the proof when the book could not find it, and never throws on a failed mail', async () => {
    store.declareCorpTaxBookPayment.mockResolvedValueOnce({
      declarationId: 'x',
      checks: [{ result: 'notFound' }],
    });
    mailer.sendTaxQuestionMail.mockRejectedValueOnce(new Error('offline'));
    const out = await sendProof(
      ctx,
      's1',
      [{ amount: 25, at: '2026-11-02T18:41:00Z', journalRef: 1, recipient: 'corporation' }],
      'Sent from the Master wallet',
      '2026-10-29'
    );
    expect(out).toMatchObject({ confirmed: false, mailed: { status: 'failed' } });
  });
});
