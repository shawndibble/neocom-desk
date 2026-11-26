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

export const readSrpDoctrines = op('list');

export const saveSrpDoctrine = op('save');

export const deleteSrpDoctrine = op('remove');

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

export const listCorpDoctrineFits = op('memberList');
