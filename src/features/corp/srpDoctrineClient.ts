/**
 * Doctrine Fits as the client sees them (ADR 0026, #4857). A Director's reads go to Firestore
 * under the rules (`verifySrpOfficer` first); every change and the pilot's pre-filing check are
 * callables. Only a short-lived access token is sent; the refresh token never leaves Dexie.
 */
import { collection, getDocs } from 'firebase/firestore/lite';
import { getValidAccessToken } from '@/auth/session';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { srpDoctrineBackendOverride } from './srpDoctrineBackendOverride';
import { invalidateSrpOfficer } from './srpClient';
import { call } from './taxBook/bookClient';
import type { DoctrineFit, DoctrinePreview, SaveDoctrineInput } from './srpTypes';

/** The corp's Doctrine Fits, newest first. Officer rules; the Director's settings read them. */
export async function readSrpDoctrines(
  characterId: number,
  corporationId: number
): Promise<DoctrineFit[]> {
  const stand = srpDoctrineBackendOverride();
  if (stand) return stand.list();
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    collection(getSyncFirestore(), 'corps', String(corporationId), 'srpDoctrines')
  );
  return snap.docs.map((d) => d.data() as DoctrineFit).sort((a, b) => b.createdAt - a.createdAt);
}

async function directorCall<Out>(
  characterId: number,
  corporationId: number,
  name: string,
  data: Record<string, unknown>
): Promise<Out> {
  const accessToken = await getValidAccessToken(characterId);
  try {
    return await call<Record<string, unknown>, Out>(characterId, name, {
      corporationId,
      accessToken,
      ...data,
    });
  } catch (err) {
    invalidateSrpOfficer(characterId, corporationId);
    throw err;
  }
}

/** A Director saves a Doctrine Fit: no `id` adds one, an `id` replaces that fit. */
export function saveSrpDoctrine(
  characterId: number,
  corporationId: number,
  input: SaveDoctrineInput
): Promise<{ id: string }> {
  const stand = srpDoctrineBackendOverride();
  if (stand) return Promise.resolve().then(() => stand.save(input));
  return directorCall(characterId, corporationId, 'saveSrpDoctrineCallable', { ...input });
}

/** A Director deletes a Doctrine Fit; filed claims keep the name they were checked against. */
export function deleteSrpDoctrine(
  characterId: number,
  corporationId: number,
  id: string
): Promise<void> {
  const stand = srpDoctrineBackendOverride();
  if (stand) return Promise.resolve().then(() => stand.remove(id));
  return directorCall(characterId, corporationId, 'deleteSrpDoctrineCallable', { id });
}

/**
 * Any member (the member page's backend stand-in covers Storybook): the check a filing of this killmail would store, with nothing written. A hull the
 * corp does not check answers `not-checked`.
 */
export async function previewSrpDoctrineCheck(
  characterId: number,
  corporationId: number,
  killmail: string
): Promise<DoctrinePreview> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'previewSrpDoctrineCheckCallable', {
    corporationId,
    accessToken,
    killmail,
  });
}
