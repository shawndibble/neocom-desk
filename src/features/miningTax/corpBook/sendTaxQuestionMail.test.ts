import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiError } from '@/esi/errors';
import { requiredScopesForEndpoints, SEND_MAIL_ENDPOINTS } from '@/esi/registry';
import type { TaxQuestionMailInput } from '@/engine/corpTaxBook/taxQuestionMail';

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  loadMailingLists: vi.fn(),
  loadCorporationCeoId: vi.fn(),
  token: vi.fn(),
}));
vi.mock('@/features/character/mail', () => ({
  sendMail: mocks.sendMail,
  loadMailingLists: mocks.loadMailingLists,
}));
vi.mock('@/features/corp/members', () => ({ loadCorporationCeoId: mocks.loadCorporationCeoId }));
vi.mock('@/db', () => ({ db: { tokens: { get: mocks.token } } }));

import { sendTaxQuestionMail } from './sendTaxQuestionMail';

const SEND = [...requiredScopesForEndpoints(SEND_MAIL_ENDPOINTS)];
const READ = [...requiredScopesForEndpoints(['getCharacterMailingLists'])];
const input: TaxQuestionMailInput = {
  kind: 'notPaying',
  memberName: 'Ada',
  corpName: 'Corp',
  days: '2026-11-02',
  amountIsk: 5,
  note: '',
};
const call = (contact?: Parameters<typeof sendTaxQuestionMail>[0]['contact']) =>
  sendTaxQuestionMail({ characterId: 5, corporationId: 9, contact, input });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.token.mockResolvedValue({ scopes: [...SEND, ...READ] });
  mocks.loadCorporationCeoId.mockResolvedValue(100);
  mocks.loadMailingLists.mockResolvedValue({
    cached: { data: [{ mailing_list_id: 7, name: 'D' }] },
  });
  mocks.sendMail.mockResolvedValue(1);
});

describe('sendTaxQuestionMail', () => {
  it('mails the CEO by default', async () => {
    expect(await call()).toEqual({ status: 'sent', to: [100], fellBackToCeo: false });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      5,
      [{ recipient_id: 100, recipient_type: 'character' }],
      expect.stringContaining('Ada'),
      expect.any(String)
    );
  });

  it('mails a list the sender is on, and the CEO when they are not', async () => {
    expect(await call({ kind: 'mailingList', id: 7, name: 'D' })).toMatchObject({ to: [7] });
    expect(await call({ kind: 'mailingList', id: 8, name: 'X' })).toEqual({
      status: 'sent',
      to: [100],
      fellBackToCeo: true,
    });
  });

  it('treats a sender without the read-mail scope as on no list', async () => {
    mocks.token.mockResolvedValue({ scopes: SEND });
    expect(await call({ kind: 'mailingList', id: 7, name: 'D' })).toMatchObject({
      to: [100],
      fellBackToCeo: true,
    });
    expect(mocks.loadMailingLists).not.toHaveBeenCalled();
  });

  it('does nothing without the send-mail scope', async () => {
    mocks.token.mockResolvedValue({ scopes: [] });
    expect(await call()).toEqual({ status: 'no-scope' });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('says so when nobody can be mailed', async () => {
    mocks.loadCorporationCeoId.mockResolvedValue(null);
    expect(await call()).toEqual({ status: 'no-recipient' });
  });

  it('reports whether ESI definitely refused the send', async () => {
    mocks.sendMail.mockRejectedValue(new EsiError(403, 'refused'));
    expect(await call()).toEqual({ status: 'failed', definite: true });
    mocks.sendMail.mockRejectedValue(new Error('network'));
    expect(await call()).toEqual({ status: 'failed', definite: false });
  });
});
