/**
 * The Corp Tax Book calls the mail queue makes (issue #4064). Firebase: reach
 * this only through `await import(...)` from anything the startup bundle
 * reaches (`app/bootImportGraph.test.ts`).
 *
 * Writes go through `editCorpTaxBookCallable` (ADR 0023) with a short-lived
 * EVE access token for the officer check, never a refresh token. A Statement's
 * `verifyToken` is read from `statementLinks/{statementId}`, which firestore
 * rules show to editors only.
 */
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore/lite';
import { getValidAccessToken } from '@/auth/session';
import { getSyncFirestore, getSyncFunctions } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';

export type BookMailAction =
  | { action: 'recordReminder'; statementId: string }
  | { action: 'recordMail'; statementId: string; mailId: number; kind: 'statement' | 'reminder' };

export async function editCorpTaxBook(
  characterId: number,
  corporationId: number,
  action: BookMailAction
): Promise<void> {
  await ensureSignedIn(characterId);
  const accessToken = await getValidAccessToken(characterId);
  const call = httpsCallable<Record<string, unknown>, unknown>(
    getSyncFunctions(),
    'editCorpTaxBookCallable'
  );
  await call({ corporationId, accessToken, ...action });
}

/** The verify token for each Statement id; one with no link doc is left out. */
export async function readVerifyTokens(
  characterId: number,
  corporationId: number,
  statementIds: readonly string[]
): Promise<Map<string, string>> {
  await ensureSignedIn(characterId);
  const db = getSyncFirestore();
  const tokens = new Map<string, string>();
  await Promise.all(
    statementIds.map(async (id) => {
      const snap = await getDoc(
        doc(db, 'corpTaxBooks', String(corporationId), 'statementLinks', id)
      );
      const token = snap.get('verifyToken');
      if (typeof token === 'string' && token !== '') tokens.set(id, token);
    })
  );
  return tokens;
}

/** Where a Statement's verify link points. The page itself is #4066. */
export function verifyUrl(origin: string, token: string): string {
  return `${origin}/corp-tax-book/verify/${token}`;
}
