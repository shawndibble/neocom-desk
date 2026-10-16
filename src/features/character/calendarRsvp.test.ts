import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiTimeoutError } from '@/esi/errors';

const put = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/esi/endpoints')>()),
  putCharacterCalendarResponse: put,
}));

import { respondToCalendarEvent } from './calendar';

beforeEach(() => vi.clearAllMocks());

describe('respondToCalendarEvent timeouts', () => {
  it('cannot confirm an RSVP whose request timed out after leaving', async () => {
    put.mockRejectedValue(new EsiTimeoutError(30_000, true));
    await expect(respondToCalendarEvent(91, 1, 'accepted')).resolves.toBe('unconfirmed');
  });

  it('says offline for a timeout that never left the gate', async () => {
    put.mockRejectedValue(new EsiTimeoutError(30_000, false));
    await expect(respondToCalendarEvent(91, 1, 'accepted')).resolves.toBe('offline');
  });
});
