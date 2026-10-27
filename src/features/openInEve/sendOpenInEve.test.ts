import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiError, EsiOfflineError, EsiTimeoutError } from '@/esi/errors';

const info = vi.hoisted(() => vi.fn());
const newMail = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({
  postOpenWindowInformation: info,
  postOpenWindowMarketDetails: vi.fn(),
  postOpenWindowContract: vi.fn(),
  postOpenWindowNewMail: newMail,
}));

import { openInEve } from './sendOpenInEve';
import { openNewMail } from './sendOpenNewMail';

beforeEach(() => vi.clearAllMocks());

describe('openInEve', () => {
  it('reports offline, with no ESI message, when the request never left the browser', async () => {
    info.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await openInEve(7, { kind: 'information', id: 1 })).toEqual({
      ok: false,
      message: null,
      offline: true,
    });
  });

  it('flags a timeout after the request left as unconfirmed, not as not-opened', async () => {
    info.mockRejectedValue(new EsiTimeoutError(30_000, true));
    expect(await openInEve(7, { kind: 'information', id: 1 })).toEqual({
      ok: false,
      message: null,
      offline: true,
      unconfirmed: true,
    });
  });

  it('keeps ESI’s own words for a refusal', async () => {
    info.mockRejectedValue(new EsiError(520, 'Character is not online'));
    expect(await openInEve(7, { kind: 'information', id: 1 })).toEqual({
      ok: false,
      message: 'Character is not online',
    });
  });
});

describe('openNewMail', () => {
  const draft = { recipientId: 2, subject: 's', body: 'b' };

  it('reports offline when the request never left the browser', async () => {
    newMail.mockRejectedValue(new EsiOfflineError());
    expect(await openNewMail(7, draft)).toEqual({ ok: false, message: null, offline: true });
  });

  it('flags a timeout after the request left as unconfirmed', async () => {
    newMail.mockRejectedValue(new EsiTimeoutError(30_000, true));
    expect(await openNewMail(7, draft)).toEqual({
      ok: false,
      message: null,
      offline: true,
      unconfirmed: true,
    });
  });

  it('keeps ESI’s own words for a refusal', async () => {
    newMail.mockRejectedValue(new EsiError(520, 'Character is not online'));
    expect(await openNewMail(7, draft)).toEqual({
      ok: false,
      message: 'Character is not online',
    });
  });
});
