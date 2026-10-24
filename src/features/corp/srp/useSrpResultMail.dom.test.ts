import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { db } from '@/db';

const corp = vi.hoisted(() => ({ id: 98000001 as number | null }));
vi.mock('../owner', () => ({ useActiveCorporationId: () => corp.id }));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (s: { activeCharacterId: number }) => unknown) =>
    select({ activeCharacterId: 9 }),
}));

import { useSrpResultMail } from './useSrpResultMail';

const MAIL = 'esi-mail.send_mail.v1';
const decided = [
  { characterId: 5, characterName: 'A', claim: { killmailId: 1, hull: 'Drake', amount: 10 } },
];
const grant = (scopes: string[]) =>
  db.tokens.put({ characterId: 9, accessToken: 'a', refreshToken: 'r', expiresAt: 1, scopes });

beforeEach(async () => {
  corp.id = 98000001;
  await db.corpMailQueue.clear();
  await db.tokens.clear();
});

describe('useSrpResultMail', () => {
  it('with no corporation resolved yet, still queues the mail', async () => {
    corp.id = null;
    await grant([MAIL]);
    const { result } = renderHook(() => useSrpResultMail());
    expect(await result.current('approved', decided)).toEqual({
      queued: ['A'],
      failed: [],
      missingScope: false,
    });
  });

  it('without the mail scope reports permission missing, corporation or not', async () => {
    corp.id = null;
    await grant(['esi-skills.read_skills.v1']);
    const { result } = renderHook(() => useSrpResultMail());
    const run = await result.current('approved', decided);
    expect(run.missingScope).toBe(true);
    expect(await db.corpMailQueue.count()).toBe(0);
  });
});
