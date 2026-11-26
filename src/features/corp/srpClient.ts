import { doc, getDoc } from 'firebase/firestore/lite';
import { getValidAccessToken } from '@/auth/session';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { srpBackendOverride, type SrpBackendOverride } from './srpBackendOverride';
import type { CallableAction } from '../../../functions/src/callableManifest';
import { delegate } from './srpBackendDelegate';
import { callSignedIn } from '@/sync/signedInCallable';
import type {
  FileSrpClaimInput,
  FiledSrpClaim,
  SrpOfficerVerdict,
  SrpSettings,
  SrpSettingsPatch,
  SrpStatus,
} from './srpTypes';

export const SRP_VERIFY_TTL_MS = 5 * 60 * 1000;
const verdicts = new Map<
  string,
  { at: number; verdict?: SrpOfficerVerdict; inflight?: Promise<SrpOfficerVerdict> }
>();

export function invalidateSrpOfficer(characterId?: number, corporationId?: number): void {
  if (characterId === undefined || corporationId === undefined) verdicts.clear();
  else verdicts.delete(`${characterId}:${corporationId}`);
}

async function changeCall<Out = void>(
  characterId: number,
  corporationId: number,
  name: CallableAction,
  data: Record<string, unknown> = {}
): Promise<Out> {
  const accessToken = await getValidAccessToken(characterId);
  try {
    return await callSignedIn(characterId, name, { ...data, corporationId, accessToken });
  } finally {
    invalidateSrpOfficer(characterId, corporationId);
  }
}

const real = {
  readSettings: async (characterId: number, corporationId: number): Promise<SrpSettings | null> => {
    await ensureSignedIn(characterId);
    const snap = await getDoc(
      doc(getSyncFirestore(characterId), 'corps', String(corporationId), 'srp', 'settings')
    );
    return snap.exists() ? (snap.data() as SrpSettings) : null;
  },
  verify: (characterId: number, corporationId: number): Promise<SrpOfficerVerdict> => {
    const key = `${characterId}:${corporationId}`;
    const held = verdicts.get(key);
    if (held?.inflight) return held.inflight;
    if (held?.verdict && Date.now() - held.at < SRP_VERIFY_TTL_MS) {
      return Promise.resolve(held.verdict);
    }
    const inflight = getValidAccessToken(characterId)
      .then((accessToken) =>
        callSignedIn<Record<string, unknown>, SrpOfficerVerdict>(
          characterId,
          'verifySrpOfficerCallable',
          { corporationId, accessToken }
        )
      )
      .then(
        (verdict) => {
          if (verdicts.get(key)?.inflight === inflight) {
            verdicts.set(key, { at: Date.now(), verdict });
          }
          return verdict;
        },
        (err: unknown) => {
          if (verdicts.get(key)?.inflight === inflight) verdicts.delete(key);
          throw err;
        }
      );
    verdicts.set(key, { at: 0, inflight });
    return inflight;
  },
  status: async (characterId: number, corporationId: number): Promise<SrpStatus> =>
    callSignedIn(characterId, 'getSrpStatusCallable', {
      corporationId,
      accessToken: await getValidAccessToken(characterId),
    }),
  turnOn: (characterId: number, corporationId: number) =>
    changeCall(characterId, corporationId, 'turnOnSrpCallable'),
  turnOff: (characterId: number, corporationId: number) =>
    changeCall(characterId, corporationId, 'turnOffSrpCallable'),
  save: (characterId: number, corporationId: number, settings: SrpSettingsPatch) =>
    changeCall(characterId, corporationId, 'saveSrpSettingsCallable', { settings }),
  reclaim: (characterId: number, corporationId: number) =>
    changeCall<{ officersRevoked: number }>(characterId, corporationId, 'reclaimSrpCallable'),
};

type SrpBackend = typeof real;

const fromStandIn = (s: SrpBackendOverride): SrpBackend => ({
  readSettings: async () => s.readSettings(),
  verify: async () => s.verify(),
  status: async () => s.status(),
  turnOn: async () => s.turnOn(),
  turnOff: async () => s.turnOff(),
  save: async (_character, _corp, patch) => s.save(patch),
  reclaim: async () => s.reclaim(),
});

const backend = (): SrpBackend => {
  const stand = srpBackendOverride();
  return stand ? fromStandIn(stand) : real;
};

const op = delegate(backend);

export const readSrpSettings = op('readSettings');

export const verifySrpOfficer = op('verify');

export const getSrpStatus = op('status');

export const turnOnSrp = op('turnOn');

export const turnOffSrp = op('turnOff');

export const saveSrpSettings = op('save');

export const reclaimSrp = op('reclaim');

export async function fileSrpClaim(
  characterId: number,
  corporationId: number,
  claim: FileSrpClaimInput
): Promise<FiledSrpClaim> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'fileSrpClaimCallable', {
    corporationId,
    accessToken,
    ...claim,
  });
}
