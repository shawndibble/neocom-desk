/**
 * Doctrine Fits as the client sees them (ADR 0026). A Director's reads go to Firestore
 * under the rules (`verifySrpOfficer` first); every change and the pilot's pre-filing check are
 * callables. Only a short-lived access token is sent; the refresh token never leaves Dexie.
 */
import type { CallableAction } from '../../../functions/src/callableManifest';
import { collection, getDocs, limit, query } from 'firebase/firestore/lite';
import { getValidAccessToken } from '@/auth/session';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { srpDoctrineBackendOverride, type SrpDoctrineBackendOverride } from './srpBackendOverride';
import { delegate } from './srpBackendDelegate';
import { invalidateSrpOfficer } from './srpClient';
import { callSignedIn } from '@/sync/signedInCallable';
import type {
  DoctrineFit,
  DoctrinePreview,
  MemberDoctrineFit,
  SaveDoctrineInput,
} from './srpTypes';

/** Most Doctrine Fits one read takes. */
export const DOCTRINE_READ_CAP = 500;

async function directorCall<Out>(
  characterId: number,
  corporationId: number,
  name: CallableAction,
  data: Record<string, unknown>
): Promise<Out> {
  const accessToken = await getValidAccessToken(characterId);
  try {
    return await callSignedIn<Record<string, unknown>, Out>(characterId, name, {
      corporationId,
      accessToken,
      ...data,
    });
  } catch (err) {
    invalidateSrpOfficer(characterId, corporationId);
    throw err;
  }
}

const real = {
  // Officer rules; the Director's settings read them.
  list: async (characterId: number, corporationId: number): Promise<DoctrineFit[]> => {
    await ensureSignedIn(characterId);
    const snap = await getDocs(
      query(
        collection(getSyncFirestore(characterId), 'corps', String(corporationId), 'srpDoctrines'),
        limit(DOCTRINE_READ_CAP)
      )
    );
    return snap.docs.map((d) => d.data() as DoctrineFit).sort((a, b) => b.createdAt - a.createdAt);
  },
  save: (
    characterId: number,
    corporationId: number,
    input: SaveDoctrineInput
  ): Promise<{ id: string }> =>
    directorCall(characterId, corporationId, 'saveSrpDoctrineCallable', { ...input }),
  remove: (characterId: number, corporationId: number, id: string): Promise<void> =>
    directorCall(characterId, corporationId, 'deleteSrpDoctrineCallable', { id }),
  // A callable, not a Firestore read: the rules keep `srpDoctrines` officers-only.
  memberList: async (characterId: number, corporationId: number): Promise<MemberDoctrineFit[]> => {
    const accessToken = await getValidAccessToken(characterId);
    const { fits } = await callSignedIn<Record<string, unknown>, { fits: MemberDoctrineFit[] }>(
      characterId,
      'listSrpDoctrineFitsCallable',
      { corporationId, accessToken }
    );
    return fits;
  },
};

type SrpDoctrineBackend = typeof real;

const fromStandIn = (s: SrpDoctrineBackendOverride): SrpDoctrineBackend => ({
  list: async () => s.list(),
  save: async (_character, _corp, input) => s.save(input),
  remove: async (_character, _corp, id) => s.remove(id),
  memberList: async () => s.memberList?.() ?? [],
});

const backend = (): SrpDoctrineBackend => {
  const stand = srpDoctrineBackendOverride();
  return stand ? fromStandIn(stand) : real;
};

const op = delegate(backend);

/** The corp's Doctrine Fits, newest first. */
export const readSrpDoctrines = op('list');

/** A Director saves a Doctrine Fit: no `id` adds one, an `id` replaces that fit. */
export const saveSrpDoctrine = op('save');

/** A Director deletes a Doctrine Fit; filed claims keep the name they were checked against. */
export const deleteSrpDoctrine = op('remove');

/**
 * Any member: the check a filing of this killmail would store, with nothing written. A hull the
 * corp does not check answers `not-checked`.
 */
export async function previewSrpDoctrineCheck(
  characterId: number,
  corporationId: number,
  killmail: string
): Promise<DoctrinePreview> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'previewSrpDoctrineCheckCallable', {
    corporationId,
    accessToken,
    killmail,
  });
}

/**
 * Any verified member: the corp's Doctrine Fits for the Fittings library. SRP off lists
 * none.
 */
export const listCorpDoctrineFits = op('memberList');
