import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type TokenRecord } from '@/db';
import { AuthError } from '@/auth/sso';
import { EsiError } from './client';
import { onEsiAuthFailure } from './authFailureSignal';
import { reportWriteAuthFailure } from './writeAuthFailure';

const CHAR_ID = 91;
const SEND_MAIL = 'esi-mail.send_mail.v1';

function refused(status: number): EsiError {
  return new EsiError(status, 'refused', undefined, 'postCharacterMail');
}

async function seedGrant(scopes: string[]): Promise<void> {
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 600_000,
    scopes,
  } as TokenRecord);
}

beforeEach(async () => {
  await db.tokens.clear();
});

function listen() {
  const reported = vi.fn();
  return { reported, unsubscribe: onEsiAuthFailure(reported) };
}

describe('reportWriteAuthFailure', () => {
  it("asks for the endpoint's Permission when the stored grant lacks its scope", async () => {
    await seedGrant(['esi-skills.read_skills.v1']);
    const { reported, unsubscribe } = listen();

    const outcome = await reportWriteAuthFailure(CHAR_ID, refused(403), 'postCharacterMail');
    unsubscribe();

    expect(outcome).toBe('grant-needed');
    expect(reported).toHaveBeenCalledWith(CHAR_ID, 'postCharacterMail');
  });

  it('stays quiet when the grant already holds the scope: a re-login could not fix that refusal', async () => {
    // A recipient who blocked the sender, say. Re-requesting the same scopes
    // would come back identical and be refused again, forever.
    await seedGrant([SEND_MAIL]);
    const { reported, unsubscribe } = listen();

    const outcome = await reportWriteAuthFailure(CHAR_ID, refused(403), 'postCharacterMail');
    unsubscribe();

    expect(outcome).toBe('refused');
    expect(reported).not.toHaveBeenCalled();
  });

  it('treats a character with no stored grant as lacking the scope', async () => {
    const { reported, unsubscribe } = listen();

    const outcome = await reportWriteAuthFailure(CHAR_ID, refused(401), 'postCharacterMail');
    unsubscribe();

    expect(outcome).toBe('grant-needed');
    expect(reported).toHaveBeenCalledOnce();
  });

  it('reports a dead refresh grant plainly: no single scope is to blame', async () => {
    await seedGrant([SEND_MAIL]);
    const { reported, unsubscribe } = listen();

    const outcome = await reportWriteAuthFailure(
      CHAR_ID,
      new AuthError('invalid_grant', 'gone', 400),
      'postCharacterMail'
    );
    unsubscribe();

    expect(outcome).toBe('refused');
    expect(reported).toHaveBeenCalledWith(CHAR_ID);
  });

  it('ignores a failure that is not an auth failure', async () => {
    const { reported, unsubscribe } = listen();

    const outcome = await reportWriteAuthFailure(CHAR_ID, refused(500), 'postCharacterMail');
    unsubscribe();

    expect(outcome).toBe('ignored');
    expect(reported).not.toHaveBeenCalled();
  });
});
